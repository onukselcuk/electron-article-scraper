"use strict";

const electron = require("electron");
const url = require("url");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const builder = require("xmlbuilder");

const { app, BrowserWindow, Menu, ipcMain } = electron;

require("electron-reload")(__dirname, {
	electron: path.join(__dirname, "node_modules", ".bin", "electron.cmd")
});

let mainWindow;
let addWindow;
let domainList;
let resultsArr = [];
let apikey;
let idx = 0;
let timeOutIds = [];
let speed;

//Listen for the app to be ready

app.on("ready", function () {
	//create new window
	mainWindow = new BrowserWindow({
		width: 1100,
		height: 850,
		webPreferences: {
			nodeIntegration: true
		}
	});
	//Load html into window
	mainWindow.loadURL(
		url.format({
			pathname: path.join(__dirname, "mainWindow.html"),
			protocol: "file:",
			slashes: true
		})
	);
	//Quit app when closed
	mainWindow.on("closed", function () {
		app.quit();
	});

	//Build menu from template
	const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
	//Insert the menu
	Menu.setApplicationMenu(mainMenu);
});

//Handle add window

function createAddWindow () {
	//create new window
	addWindow = new BrowserWindow({
		width: 300,
		height: 200,
		title: "Add Shopping List Item",
		webPreferences: {
			nodeIntegration: true
		}
	});
	//Load html into window
	addWindow.loadURL(
		url.format({
			pathname: path.join(__dirname, "addWindow.html"),
			protocol: "file:",
			slashes: true
		})
	);
	//Garbage Collection handle
	addWindow.on("close", function () {
		addWindow = null;
	});
}

//Catch item:add

ipcMain.on("item:add", function (e, item) {
	mainWindow.webContents.send("item:add", item);
	addWindow.close();
});

ipcMain.on("domain:send", function (e, formValues) {
	idx = 0;
	speed = formValues.speed;
	apikey = formValues.apikey;
	domainList = formValues.domainLis;
	if (domainList.length > 0) {
		domainList = domainList.split("\n");
		mainWindow.webContents.send("list:length", domainList.length);
		scrape();
	} else {
		mainWindow.webContents.send("list:error");
	}
});

ipcMain.on("page:reload", function (e) {
	mainWindow.reload();
	stopScraping();
});

ipcMain.on("domain:save", function (e, fileName) {
	if (fileName === undefined) {
		mainWindow.webContents.send("file:notSaved");
		return;
	}

	let xml = builder.create("Posts");

	resultsArr.forEach((cur, index) => {
		xml
			.ele("Post", { id: index + 1 })
			.ele("Title", cur.title)
			.up()
			.ele("Html", cur.html)
			.up()
			.ele("OriginalHtml", cur.originalHtml)
			.up()
			.ele("Text", cur.text)
			.up()
			.ele("Url", cur.url)
			.up()
			.ele("Description", cur.description)
			.end({ pretty: true });
	});

	fs.writeFile(fileName, xml, function (err) {
		if (err) {
			mainWindow.webContents.send("file:notSaved");
			return;
		} else {
			mainWindow.webContents.send("file:save");
		}
	});
});

ipcMain.on("scrape:stop", function (e) {
	stopScraping();
});

function stopScraping () {
	timeOutIds.forEach((cur) => {
		clearTimeout(cur);
	});
	mainWindow.webContents.send("scrape:stopped");
}

function scrape () {
	resultsArr = [];
	timeOutIds = [];
	mainWindow.webContents.send("domain:number", domainList.length);
	for (let i = 0; i < domainList.length; i++) {
		(function (i) {
			const timeOutId = setTimeout(function () {
				test(i);
			}, speed * i);
			timeOutIds.push(timeOutId);
		})(i);
	}
}

function test (i) {
	axios({
		method: "post",
		url: "https://autoextract.scrapinghub.com/v1/extract",
		data: [
			{
				url: domainList[i],
				pageType: "article"
			}
		],
		headers: { "Content-Type": "application/json" },
		auth: {
			username: apikey,
			password: ""
		}
	})
		.then((res) => {
			const data = res.data[0].article;
			const result = {
				title: data.headline || "",
				html: data.articleBodyHtml,
				originalHtml: data.articleBodyRaw,
				text: data.articleBody,
				url: data.url,
				description: data.description,
				images: data.images
			};
			resultsArr.push(result);
		})
		.then(() => {
			idx++;
			const numberText = idx;
			mainWindow.webContents.send("result:number", numberText);
			// if (idx === domainList.length) {
			// 	console.log(resultsArr);
			// }
		})
		.catch((e) => {
			mainWindow.webContents.send("result:error");
		});
}

//Create menu template
const mainMenuTemplate = [
	{
		label: "File",
		submenu: [
			{
				label: "Quit",
				accelerator: process.platform == "darwin" ? "Command+Q" : "Ctrl+Q",
				click () {
					app.quit();
				}
			}
		]
	}
];

// If mac, add empty object to menu

if (process.platform == "darwin") {
	mainMenuTemplate.unshift({});
}

// Add developer tools item if not in prod
if (process.env.NODE_ENV !== "production") {
	mainMenuTemplate.push({
		label: "Developer Tools",
		submenu: [
			{
				label: "Toggle DevTools",
				accelerator: process.platform == "darwin" ? "Command+I" : "Ctrl+I",
				click (item, focusedWindow) {
					focusedWindow.toggleDevTools();
				}
			},
			{
				role: "reload"
			}
		]
	});
}
