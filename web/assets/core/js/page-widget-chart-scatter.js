"use strict";

viewModel.scatter = new Object();
var rs = viewModel.scatter;
var dataPoints = [{ field: "value1", name: "value1", aggr: "sum" }];

rs.contentIsLoading = ko.observable(false);
rs.title = ko.observable('P&L Analytic');
rs.breakdownBy = ko.observable('customer.channelname');
rs.pplheader = ko.observable('Direct Labor');
rs.datascatter = ko.observableArray([]);
rs.plheader = ko.observable('plgroup1'); //plmodel.plheader1

rs.optionDimensionSelect = ko.observableArray([]);

rs.getSalesHeaderList = function () {
	app.ajaxPost("/report/GetSalesHeaderList", {}, function (res) {
		var data = Lazy(res).map(function (k, v) {
			return { field: k._id[rs.plheader()], name: k._id[rs.plheader()] };
		}).toArray();
		rs.optionDimensionSelect(data);
		rs.optionDimensionSelect.remove(function (item) {
			return item.field == 'Net Sales';
		});
		rs.refresh();
		setTimeout(function () {
			rs.pplheader('');
		}, 300);
	});
};

rs.refresh = function () {
	rs.contentIsLoading(true);
	var dimensions = [{ "field": rs.plheader(), "name": rs.plheader() }, { "field": rs.breakdownBy(), "name": "Channel" }, { "field": "year", "name": "Year" }];
	var dataPoints = [{ field: "value1", name: "value1", aggr: "sum" }];
	var base = rpt.wrapParam(dimensions, dataPoints);
	var param = app.clone(base);
	param.filters.push({
		"Op": "$eq",
		"Field": rs.plheader(),
		"Value": rs.pplheader()
	});
	app.ajaxPost("/report/summarycalculatedatapivot", param, function (res) {
		var dataall = Lazy(res.Data).groupBy(function (f) {
			return f['year'];
		}).map(function (k, v) {
			return app.o({ _id: v, data: k });
		}).toArray();

		var param = app.clone(base);
		param.filters.push({
			"Op": "$eq",
			"Field": rs.plheader(),
			"Value": 'Net Sales'
		});

		app.ajaxPost("/report/summarycalculatedatapivot", param, function (res2) {
			var dataall2 = Lazy(res2.Data).groupBy(function (f) {
				return f['year'];
			}).map(function (k, v) {
				return app.o({ _id: v, data: k });
			}).toArray();

			var max = 0;

			rs.datascatter([]);
			var title = Lazy(rpt.optionDimensions()).findWhere({ field: rs.breakdownBy() }).title;
			for (var i in dataall) {
				var currentDataAll = Lazy(dataall).findWhere({ _id: dataall[i]._id });
				var currentDataAll2 = Lazy(dataall2).findWhere({ _id: dataall[i]._id });

				var totalDataAll = Lazy(currentDataAll.data).sum(function (e) {
					return e.value1;
				}); // by breakdown
				var totalDataAll2 = Lazy(currentDataAll2.data).sum(function (e) {
					return e.value1;
				}); // by net sales

				var maxNetSales = Lazy(currentDataAll.data).max(function (e) {
					return e.value1;
				}).value1;
				var percentage = totalDataAll / totalDataAll2 * 100;
				var percentageToMaxSales = percentage * maxNetSales / 100;

				max = Lazy([max, maxNetSales]).max(function (d) {
					return d;
				});
				console.log('max', max, 'breakdown', totalDataAll, 'netsales', totalDataAll2, 'maxnetsales', maxNetSales, 'percentage', percentage, 'safsf', percentageToMaxSales);

				for (var a in dataall[i].data) {
					rs.datascatter.push({
						pplheader: percentageToMaxSales,
						pplheaderPercent: percentage,
						value1: dataall[i].data[a].value1 / maxNetSales * 100,
						title: dataall[i].data[a][title],
						header: dataall[i].data[a].plmodel_plheader1,
						year: dataall[i].data[a].year
					});
					console.log('asd ', dataall[i].data[a].value1, 'ddd ', dataall[i].data[a].value1 / maxNetSales * 100);
				}
				if (i == 0) {
					rs.datascatter.push({
						pplheader: null,
						value1: null,
						title: '',
						header: null
					});
				}
			}
			rs.generateReport(dataall[0]._id, dataall[1]._id, max);
		});
	});
};

rs.generateReport = function (year1, year2, max) {
	rs.contentIsLoading(false);
	$('#scatter-view').width(rs.datascatter().length * 100);
	$("#scatter-view").kendoChart({
		dataSource: {
			data: rs.datascatter()
		},
		title: {
			text: ""
		},
		legend: {
			visible: true,
			position: "bottom"
		},
		seriesDefaults: {
			type: "line",
			missingValues: "gap"
		},
		seriesColors: ["#ff8d00", "#678900"],
		series: [{
			name: "PPL Header",
			field: 'pplheaderPercent',
			width: 3,
			tooltip: {
				visible: true,
				template: "#: dataItem.title # : #: kendo.toString(dataItem.pplheaderPercent, 'n2') # %"
			},
			markers: {
				visible: false
			}
		}, {
			name: "Dimension",
			field: "value1",
			width: 3,
			opacity: 0,
			markers: {
				type: 'cross',
				size: 12
			},
			tooltip: {
				visible: true,
				template: function template(d) {
					return d.dataItem.title + " on " + d.dataItem.year + ": " + kendo.toString(d.value, 'n2');
				}
			}
		}],
		valueAxis: {
			majorGridLines: {
				color: '#fafafa'
			},
			label: {
				format: "{0}%"
			}
		},
		categoryAxis: [{
			field: 'title',
			labels: {
				rotation: 20
			},
			majorGridLines: {
				color: '#fafafa'
			}
		}, {
			categories: [year1, year2],
			line: { visible: false }
		}]
	});
};

$(function () {
	rpt.value.From(moment("2015-02-02").toDate());
	rpt.value.To(moment("2016-02-02").toDate());
	// rs.refresh()
	rs.getSalesHeaderList();
});