"use strict";

const fs = require('fs')
const csv = require('fast-csv');
const date = require('date-and-time')
const https = require('https');

const LOOKING_FOR_CURRENT_LEVEL = 1
const LOOKING_FOR_NEXT_EXTREME = 2
const NOT_LOOKING_ANYMORE = 3
const RISING = "HW"
const FALLING = "LW"


function roundToNearestMinute(date = new Date()) {
  const minutes = 10;
  const ms = 1000 * 60 * minutes;

  return new Date(Math.round(date.getTime() / ms) * ms);
}


function initialiseStations (app, options) {

	app.debug ("Initialising SignalK with tidal stations fixed data.")

	options.devices.forEach(device => {
		if (device.enabled) {
			const message = {context: 'aton.' + device.stationName, updates: [ {values:
				[ { path: 'navigation.position', value: {latitude: device.stationLat, longitude: device.stationLon} },
				  { path: 'environment.nextExtreme', value: ""},
				  { path: 'environment.tidalTrend', value: "" }
				 ] } ] }
			app.handleMessage('my-signalk-plugin', message)
		}
	})
}



function updateStations(app, options) {
	app.debug ("Updating tidal stations current waterlevels from downloaded files into SignalK.")
	const timestampNow = new Date()
	const dateNow = date.format(roundToNearestMinute(timestampNow), "DD-M-YYYY")
	const timeNow = date.format(roundToNearestMinute(timestampNow), "HH:mm:ss")
	options.devices.forEach(device => {
		if (device.enabled) {
			const fileName = require('path').join(app.getDataDirPath(), device.csvFileName)
			let status = LOOKING_FOR_CURRENT_LEVEL 
			let previousWaterLevel = 0 
			let previousTimeStamp = 0 
			let waterLevel = 0 
			let tidalTrend = 0
			let tide = 0
			let currentTide = 0
			let nextExtreme = ""
			console.log ("Reading", fileName)
			fs.createReadStream(fileName)
				.pipe(csv.parse({ headers: true, delimiter: ";" }))
				.on('error', error => console.error(error))
				.on('data', row => {
					waterLevel = (row.Verwachting > 0 ? "+" : "") + (parseFloat(row.Verwachting)/100).toFixed(2)
					tidalTrend = waterLevel - previousWaterLevel
					tidalTrend = (tidalTrend > 0 ? "+": "") + tidalTrend.toFixed(2)
					if (tidalTrend > 0)
						tide = RISING
					if (tidalTrend < 0)
						tide = FALLING
					if (row.Datum == dateNow && row.Tijd == timeNow) {
						console.log (device.stationName, "waterLevel", waterLevel)
						app.handleMessage('my-signalk-plugin', {context: 'aton.' + device.stationName, updates: [ {values: 
							[ { path: 'environment.depth.belowSurface', value: waterLevel },
							  { path: 'environment.tidalTrend', value: tidalTrend } ]
						} ] })
						status = LOOKING_FOR_NEXT_EXTREME
						currentTide = tide
					}
					if (status == LOOKING_FOR_NEXT_EXTREME)
						if (tide != currentTide) {
							nextExtreme = currentTide + " " + previousTimeStamp + " " + previousWaterLevel
							console.log(device.stationName, "nextExtreme", nextExtreme)
							app.handleMessage('my-signalk-plugin', {context: 'aton.' + device.stationName, updates: [ {values:
								[ { path: 'environment.nextExtreme', value: nextExtreme } ]
							} ] })
							status = NOT_LOOKING_ANYMORE
						}
					previousWaterLevel = waterLevel
					previousTimeStamp = row.Tijd.substring(0,5)
				});
		}
	}) // forEach
} // function updateStations


function downloadStationData(app, options) {
	options.devices.forEach(device => {
		app.debug(">---- Downloading file " + device.csvFileName) 
		const fileName = require('path').join(app.getDataDirPath(), device.csvFileName)
		const file = fs.createWriteStream(fileName)
		const request = https.get(options.downloadUrl + device.urlSuffix, function(response) {
			if (response.statusCode !== 200) {
				app.debug("***** " + device.csvFileName + " not OK")
				return;
			}
  			response.pipe(file);
			file.on('finish', function () {
				app.debug("----> " + device.csvFileName + " downloaded OK")
				file.close()
			})
			file.on('error', function () {
				app.debug("***** " + device.csvFileName + " NOT OK")
				file.close()
			})
		});

	})
}


module.exports = {
	initialiseStations: initialiseStations,
	updateStations: updateStations,
	downloadStationData: downloadStationData
}

