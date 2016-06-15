viewModel.chartCompare = {}
let ccr = viewModel.chartCompare

ccr.data = ko.observableArray([])
ccr.dataComparison = ko.observableArray([])
ccr.title = ko.observable('Chart Comparison')
ccr.contentIsLoading = ko.observable(false)
ccr.categoryAxisField = ko.observable('category')
ccr.breakdownBy = ko.observable('')
ccr.limitchart = ko.observable(4)
ccr.optionComparison = ko.observableArray([
	{ field: 'qty', name: 'Quantity' },
	{ field: 'outlet', name: 'Outlet' },
	{ field: 'price', name: 'Price' },
])
ccr.comparison = ko.observableArray(['qty', 'outlet'])

ccr.getDecreasedQty = (useCache = false) => {
	ccr.contentIsLoading(true)
	toolkit.ajaxPost(`/report/GetDecreasedQty`, {}, (res) => {
		ccr.dataComparison(res)
		ccr.contentIsLoading(false)
		ccr.refresh()
	}, () => {
		ccr.contentIsLoading(false)
	}, {
		cache: (useCache == true) ? 'chart comparison' : false
	})
}
ccr.refresh = () => {
	// ccr.dataComparison(ccr.dummyJson)
	let tempdata = []
	// let qty = 0
	// let price = 0
	let outlet = 0
	let maxline = 0
	let maxprice = 0
	let maxqty = 0
	let quarter = []
	for (var i in ccr.dataComparison()){
		if (ccr.dataComparison()[i].productName != undefined){
			// qty = _.filter(ccr.dataComparison()[i].qty, function(resqty){ return resqty == 0}).length
			// price = _.filter(ccr.dataComparison()[i].price, function(resprice){ return resprice == 0}).length
			maxprice = _.max(ccr.dataComparison()[i].price)
			maxqty = _.max(ccr.dataComparison()[i].qty)
			if (maxprice > maxqty)
				maxline = maxprice
			else
				maxline = maxqty
			outlet = _.max(ccr.dataComparison()[i].outletList)
			quarter = []
			for (var a in ccr.dataComparison()[i].qty){
				quarter.push(`Quarter ${parseInt(a)+1}`)
			}
			tempdata.push({
				qty: ccr.dataComparison()[i].qtyCount,
				price: ccr.dataComparison()[i].priceCount,
				quarter: quarter,
				maxoutlet: outlet + (outlet/2),
				maxline: maxline + (maxline/4),
				productName: ccr.dataComparison()[i].productName,
				data: ccr.dataComparison()[i]
			})
		}
	}
	// let sortPriceQty = _.take(_.sortBy(tempdata, function(item) {
	//    return [item.qty, item.price]
	// }).reverse(), ccr.limitchart())
	let sortPriceQty = _.take(tempdata, ccr.limitchart())
	ccr.data(sortPriceQty)
	ccr.render()
}
ccr.render = () => {
	let configure = (data, full) => {
		let seriesLibs = {
			price: { 
				name: 'Price', 
				// field: 'value1', 
				data: data.price, 
				width: 3, 
				markers: {
					visible: true,
					size: 10,
					border: {
						width: 3
					}
				},
				axis: "priceqty"
			},
			qty: { 
				name: 'Qty', 
				// field: 'value2', 
				data: data.qty, 
				width: 3, 
				markers: {
					visible: true,
					size: 10,
					border: {
						width: 3
					}
				},
				axis: "priceqty"
			},
			outlet: { 
				name: 'Outlet', 
				// field: 'value3', 
				data: data.outletList,
				type: 'column', 
				width: 3, 
				overlay: {
					gradient: 'none'
				},
				border: {
					width: 0
				},
				markers: {
					visible: true,
					style: 'smooth',
					type: 'column',
				},
				axis: "outlet"
			}
		}

		let series = []
		ccr.comparison().forEach((d) => {
			series.push(seriesLibs[d])
		})

		let valueAxes = []
		if (ccr.comparison().indexOf('qty') > -1 || ccr.comparison().indexOf('price') > -1) {
			valueAxes.push({
				name: "priceqty",
                title: { text: "Qty & Price" },
				majorGridLines: {
					color: '#fafafa'
				},
				max: full.maxline,
			})
		}
		if (ccr.comparison().indexOf('outlet') > -1) {
			valueAxes.push({
				name: "outlet",
                title: { text: "Outlet" },
                majorGridLines: {
					color: '#fafafa'
				},
				max: full.maxoutlet,
			})
		}

		console.log(valueAxes)

		return {
			// dataSource: {
			// 	data: data
			// },
			series: series,
			seriesColors: ["#5499C7", "#ff8d00", "#678900"],
			seriesDefaults: {
	            type: "line",
	            style: "smooth"
			},
			categoryAxis: {
				baseUnit: "month",
				// field: ccr.categoryAxisField(),
				categories: full.quarter,
				majorGridLines: {
					color: '#fafafa'
				},
				labels: {
					font: 'Source Sans Pro 11',
					rotation: 40
					// template: (d) => `${toolkit.capitalize(d.value).slice(0, 3)}`
				}
			},
			legend: {
				position: 'bottom'
			},
			valueAxes: valueAxes,
			tooltip: {
				visible: true,
				template: (d) => `${d.series.name} on : ${kendo.toString(d.value, 'n2')}`
			}
		}
	}

	let chartContainer = $('.chart-comparison')
	chartContainer.empty()
	for (var e in ccr.data()){
		let html = $($('#template-chart-comparison').html())
		let config = configure(ccr.data()[e].data, ccr.data()[e])

		html.appendTo(chartContainer)
		html.find('.title').html(ccr.data()[e].data.productName)
		html.find('.chart').kendoChart(config)
	}
	chartContainer.append($('<div />').addClass('clearfix'))
}

rpt.toggleFilterCallback = () => {
	$('.chart-comparison .k-chart').each((i, e) => {
		$(e).data('kendoChart').redraw()
	})
}

$(() => {
	ccr.getDecreasedQty(false)
})