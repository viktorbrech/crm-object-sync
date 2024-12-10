"use strict";

const express = require("express");
const { authUrl, getAccessToken, redeemCode } = require("./auth");
require("dotenv/config");
const { getCustomerId, PORT } = require("./utils");
const { initialContactsSync } = require("./initialSyncFromHubSpot");
const { syncContactsToHubSpot } = require("./initialSyncToHubSpot");
const { prisma } = require("./clients");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/contacts', async (req, res) => {
    const contacts = await prisma.contacts.findMany({});
    res.send(contacts);
});

app.get('/api/install', (req, res) => {
    res.send(`<html><body><a href="${authUrl}" target="blank">${authUrl}</a></body></html>`);
});

app.get('/sync-contacts', async (req, res) => {
    const syncResults = await syncContactsToHubSpot();
    res.send(syncResults);
});

app.get('/', async (req, res) => {
    const accessToken = await getAccessToken(getCustomerId());
    res.send(accessToken);
});

app.get('/oauth-callback', async (req, res) => {
    const code = req.query.code;
    if (code) {
        try {
            const authInfo = await redeemCode(code.toString());
            const accessToken = authInfo.accessToken;
            res.redirect(`http://localhost:${PORT}/`);
        } catch (error) {
            res.redirect(`/?errMessage=${error.message}`);
        }
    }
});

app.get('/initial-contacts-sync', async (req, res) => {
    const syncResults = await initialContactsSync();
    res.send(syncResults);
});

app.listen(PORT, () => {
    console.log(`App is listening on port ${PORT}`);
});
