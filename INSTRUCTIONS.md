# Sample App for Component 2 of the 4Q/2024 Principal TC Certification

## Guidance

### Prototype Use Case

This sample app showcases some integration practices for synchronizing CRM contact records between HubSpot and external applications. As an example of an external system that would synchronize with the HubSpot CRM in this way, consider a project management app or even an external CRM.

What this project includes/demonstrates:

- Setting up HubSpot authentication and generating OAuth access and refresh tokens.
- Creating and populating a PostgreSQL database with contact records.
- Synchronizing the seeded contact records from the database to HubSpot and storing the generated hs_object_id back in the database.
- Synchronizing contact records from HubSpot to the database: By default, the sync process uses Prisma’s upsert functionality, matching records by email. If a match is found, it updates the record by adding the hs_object_id. For contacts without an email, a new record is created in the database. The job results indicate the number of upserted records and new records created for contacts without email addresses.

## Prototype Endpoints:

This app runs an Express.js web server that exposes the following routes. When running it on your own machine, you could e.g. access the "api/install" endpoint via the URL "http://localhost:3000/api/install".

- **GET /api/install**: Sends a simple HTML response containing a link (authUrl) for users to authenticate. The link opens in a new tab when clicked. This should be the first step a new user or client performs to initiate the OAuth2 authorization process.

- **GET /oauth-callback**: It processes the authorization code to obtain an access token for the user and any failure in retrieving it redirects with an error message.

- **GET /** : Once authenticated, the access token can be retrieved using this endpoint. This ensures that any subsequent API operations requiring authentication can be performed.

- **GET /initial-contacts-sync**: After establishing authentication and obtaining an access token, the initial **synchronization of contacts from HubSpot to the local database** can occur.

- **GET /contacts**: This endpoint fetches contacts from the local database.

- **GET /sync-contacts**: This is used to **synchronize any updates or new contact data from the local database to HubSpot**. Email is used as a primary key for logical deduplication, making it crucial that email addresses are correctly managed and non-null where possible. To minimize errors, we first retrieve existing contacts from HubSpot and exclude those already known from our batch. The following methods are employed to send new contacts to HubSpot and to store their HubSpot object IDs back in our local database.

### Implementation notes

This prototype is derived an existing sample app which you may or may not recognize. It has been modified and tailored to the context of this code challenge.

### How to Approach the Exercises

Some of these exercises may be quite hard, and you may run out of time. That's OK. The purpose of these exercises is to give you a chance to demonstrate your skills, and to give us a chance to see how you approach a problem. The most important points to keep in mind:

* Show your work: if you make a code modification or try something out, show and explain it in your Zoom recording. Even if it doesn't work, sound reasoning and troubleshooting will earn partial credit. Even a perfect solution will need to be explained on the Zoom to earn full credit.
* Some exercises have an "ADVANCED" option. To really impress, you should try to complete those sections along with the rest of the exercise. But if you are out of your depth or you run out of time, prioritize answering every exercise, even if you have to skip some of the "ADVANCED" sections.
* Your Zoom is a piece of technical documentation, not a polished demo. Your language should be as precise as possible. Acknowledge limitations or uncertainties. Use appropriate technical terms, but avoid (or explain) unnecessary jargon. 
* Imagine as your audience a technically proficient user who has good programming skills and HubSpot platform knowledge, but is no JavaScript or React expert and may not be fully up to date on HubSpot's latest developer-centric features.
* Be clear which exercise you are addressing at any given time. If you run out of time, you may skip an exercise, but please don't jump around between exercises.

### Deliverables

Your key deliverable for this component is a Zoom recording of you walking through your solutions to the exercises below. The recording should be no longer than 30 minutes. You should share your screen and show your work.

If you modify or add to the code of this prototype, you should also submit a link to the final version of your code. For example, you could turn it into a ZIP file and upload it to Google Drive and share with me (please do not upload it to a public GitHub repo).

### Deadline and Submission

You should submit all your deliverables within 2.5 hours of receiving this information (2 hours of work, and 30 minutes to record your Zoom). If you need more time, please let me know. Please hold yourself to this time limit. 

Once you have recorded your Zoom, please share it with me immediately on Slack. Thank you.

## Setup

### Create a suitable setup environment

1. Create a (public) developer account.
2. On your HubSpot computer, install Node.js (tested with v22.10.0)
3. Decide on which HubSpot portal you want to use for your testing. Your HubSpotter portal is fine (as is any other portal). Try and pick a portal that has some contacts and companies in it, preferably not too many though (best below 1000, though not necessary).
4. In your [HubSpot public app](https://developers.hubspot.com/docs/api/creating-an-app), add localhost:3000/oauth-callback as a redirect URL
5. Add the following scopes to your public app:

- crm.schemas.companies.write

- crm.schemas.contacts.write

- crm.schemas.companies.read

- crm.schemas.contacts.read

- crm.objects.companies.read

- crm.objects.companies.write

- crm.objects.contacts.read

- crm.objects.contacts.write

6. This sample app uses a SQLite database, and you may find it beneficial to have an easy way to inspect its contents. For that reason, you should install something like https://sqlitebrowser.org/ (available for Windows as well as MacOS). Just point it to the prisma/dev.db file the app will create.

7. Make sure to DISABLE Github Copilot if you have it. You can use HubGPT to aid in your analysis, but no other AI tools.


### Deploy this project

1. Ensure you have Node.js installed.
2. Unzip this repository somewhere on your computer, and open a terminal window with the repository as a working directory (or a terminal inside VS Code). To confirm you have the right working directory, type "ls *.md" into your terminal, which should output "INSTRUCTIONS.md"

3. Create the .env file with these entries (see examples in the [.env.example](./.env.example) file):

- DATABASE_URL the location of your local SQLite database: "file:./dev.db"

- CLIENT_ID from your Hubspot public app

- CLIENT_SECRET from your Hubspot public app

4. Run `npm install` to install the required Node packages.

5. Run `npm run db-init` to create the necessary tables in PostgreSQL

6. Run `npm run db-seed` to seed the database with test data

7. Run `npm run dev` to start the server

8. Visit `http://localhost:3000/api/install` in a browser to get the OAuth install link. Use the link to connect your public app to the HubSpot portal you want to use for this project.


## Exercises

### Exercise 1

Deploy this app as described in this file. Demo the different endpoints documented above. What do each of them do in your local database and in your HubSpot CRM, respectively?

Where does the app (locally) store the following items, if at all:

* refresh and/or access tokens
* a contact
* associations between contacts and companies

### Exercise 2

Study and understand the code of this prototype application (mostly the "initialSyncFromHubSpot.js" and "initialSyncToHubSpot.js" files).

How and where are the functions "initialContactsSync" and "syncContactsToHubSpot" invoked? What data flows from where to where in the process?

### Exercise 3

Consider the authentication method used in this app.

What is your interpretation of the "GET /" (http://localhost:3000/) endpoint? If you wanted to use this app as the basis for a live product, how would you likely handle it?

Suppose you wanted to switch this app to private app authentication. Try and pinpoint all the elements of the app (files / code snippets) that would need to be edited to accomplish the switch.

### Exercise 4

Suppose the "external system" HubSpot is integrating with here is some project management tool. You want to achieve a 15-min sync cycle. What would need to happen for this app to be syncing contacts every 15 minutes?

Critically assess the fundamental architecture of this app: why is it running a web server at all? Which elements (if any) of the app's functionality critically rely on a running web server, and which elements could be implmeneted without it?

### Exercise 5

This app uses the HubSpot Node.js client library to talk to HubSpot CRM APIs. Characterize in detail how this library will handle concurrency and errors. Specifically, how many API requests might be made simultaneously at most? Which html error code will cause a retry, and how long will the client library wait until it retries (say, after the first failed request)?

### Exercise 6

Consider that this sample app implements a contact upsert logic, but does not use the shiny new upsert endpoints of our CRM APIs (see e.g. https://developers.hubspot.com/beta-docs/guides/api/crm/objects/contacts#upsert-contacts )

Explain whether this new endpoint helps simplify the code of the sample app, and which section specifically could be simplified.

If you can, draft edits to the code that implement this change. You can assume that a "batchApi.upsert" method is available in the client library.

(ADVANCED) Try and implement a change to the sampe app code that uses the CRM API upsert method, but without using the HubSpot client library. You can use the request or axios libraries instead, or you can use Node's native fetch method. Explain any problems you encounter or anticipate.
