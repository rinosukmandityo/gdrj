package main

import (
	"eaciit/gdrj/model"
	"eaciit/gdrj/modules"
	"os"

	"time"

	"github.com/eaciit/dbox"
	"github.com/eaciit/orm/v1"
	"github.com/eaciit/toolkit"
)

var conn dbox.IConnection
var count int
var ratioTableName string

var (
	sourcetablename = "salespls-summary"
	calctablename   = "salespls-summary"
	desttablename   = "salespls-summary"
	t0              time.Time
	masters         = toolkit.M{}
	sgaalloc        = map[string]float64{
		"EXP": 0.08,
		"I4":  0.08,
		"I6":  0.105,
	}
)

type plalloc struct {
	ID               string `bson:"_id" json:"_id"`
	Key              string
	Key1, Key2, Key3 string
	Ref1             float64
	Current          float64
	Expect           float64
	Absorbed         float64
}

type allocmap map[string]*plalloc

var (
	plallocs = allocmap{}
	totals1  = allocmap{}
	totals2  = allocmap{}
)

func main() {
	setinitialconnection()
	prepmastercalc()
	buildratio()
	processTable()
}

func buildratio() {
	cursor, _ := conn.NewQuery().From(calctablename).Select().Cursor(nil)
	defer cursor.Close()

	i := 0
	count := cursor.Count()
	mstone := 0
	t0 = time.Now()
	for {
		mr := toolkit.M{}
		e := cursor.Fetch(&mr, 1, false)
		if e != nil {
			break
		}
		i++
		makeProgressLog("Build ratio", i, count, 5, &mstone, t0)

		key := mr.Get("key", toolkit.M{}).(toolkit.M)
		fiscal := key.GetString("date_fiscal")
		channelid := key.GetString("customer_channelid")
		sales := mr.GetFloat64("PL8A")
		keytotal := toolkit.Sprintf("%s_%s", fiscal, channelid)
		if channelid == "EXP" || channelid == "I4" || channelid == "I6" {
			sgaratio := sgaalloc[channelid]
			sgavalue := sgaratio * sales
			adjustAllocs(&totals1, keytotal, 0, -sgavalue, 0, sales)
			adjustAllocs(&totals2, fiscal, 0, sgavalue, 0, 0)
		} else {
			adjustAllocs(&totals2, fiscal, 0, 0, 0, sales)
		}
	}
}

func processTable() {
	connsave, _ := modules.GetDboxIConnection("db_godrej")
	defer connsave.Close()
	qsave := connsave.NewQuery().SetConfig("multiexec", true).From(desttablename).Save()

	connselect, _ := modules.GetDboxIConnection("db_godrej")
	defer connselect.Close()

	cursor, _ := connselect.NewQuery().From(calctablename).Select().Cursor(nil)
	defer cursor.Close()

	i := 0
	count := cursor.Count()
	mstone := 0
	t0 = time.Now()
	for {
		mr := toolkit.M{}
		e := cursor.Fetch(&mr, 1, false)
		if e != nil {
			break
		}
		i++
		makeProgressLog("Processing", i, count, 5, &mstone, t0)

		key := mr.Get("key", toolkit.M{}).(toolkit.M)
		fiscal := key.GetString("date_fiscal")
		channelid := key.GetString("customer_channelid")
		sales := mr.GetFloat64("PL8A")
		//keytotal := toolkit.Sprintf("%s_%s", fiscal, channelid)
		//total1 := totals1[keytotal]
		total2 := totals2[fiscal]
		if channelid == "EXP" || channelid == "I4" || channelid == "I6" {
			sgaratio := sgaalloc[channelid]
			if channelid == "EXP" {
				sgaratio = sgaalloc[channelid]
			}
			value := -sgaratio * sales
			mr.Set("PL34_Other", value)
		} else {
			value := mr.GetFloat64("PL34_Other")
			value += sales * total2.Expect / total2.Ref1
			mr.Set("PL34_Other", value)
		}

		gdrj.CalcSum(mr, masters)
		esave := qsave.Exec(toolkit.M{}.Set("data", mr))
		if esave != nil {
			toolkit.Printfn("Error: %s", esave.Error())
			return
		}
	}
}

func adjustAllocs(allocsmap *allocmap, key string, current, expect, absorbed, ref1 float64) {
	allocs := *allocsmap
	alloc := allocs[key]
	if alloc == nil {
		alloc = new(plalloc)
		alloc.Key = key
		alloc.ID = key
	}
	alloc.Current += current
	alloc.Expect += expect
	alloc.Ref1 += ref1
	alloc.Absorbed += absorbed
	allocs[key] = alloc
	*allocsmap = allocs
}

func makeProgressLog(reference string, i, count, step int, current *int, tstart time.Time) int {
	perstep := count * step / 100
	icurrent := *current
	if icurrent == 0 {
		icurrent = perstep
	}
	pct := i * 100 / count
	if i >= icurrent {
		toolkit.Printfn("Processing %s, %d of %d [%d pct] in %s",
			reference, i, count, pct, time.Since(tstart).String())
		icurrent += perstep
	}
	*current = icurrent
	return icurrent
}

func buildmap(holder interface{},
	fnModel func() orm.IModel,
	filter *dbox.Filter,
	fnIter func(holder interface{}, obj interface{})) interface{} {
	crx, ecrx := gdrj.Find(fnModel(), filter, nil)
	if ecrx != nil {
		toolkit.Printfn("Cursor Error: %s", ecrx.Error())
		os.Exit(100)
	}
	defer crx.Close()
	for {
		s := fnModel()
		e := crx.Fetch(s, 1, false)
		if e != nil {
			break
		}
		fnIter(holder, s)
	}
	return holder
}

func prepmastercalc() {
	toolkit.Println("--> PL MODEL")
	masters.Set("plmodel", buildmap(map[string]*gdrj.PLModel{},
		func() orm.IModel {
			return new(gdrj.PLModel)
		},
		nil,
		func(holder, obj interface{}) {
			h := holder.(map[string]*gdrj.PLModel)
			o := obj.(*gdrj.PLModel)
			h[o.ID] = o
		}).(map[string]*gdrj.PLModel))
}

func setinitialconnection() {
	var err error
	conn, err = modules.GetDboxIConnection("db_godrej")

	if err != nil {
		toolkit.Println("Initial connection found : ", err)
		os.Exit(1)
	}

	err = gdrj.SetDb(conn)
	if err != nil {
		toolkit.Println("Initial connection found : ", err)
		os.Exit(1)
	}
}
