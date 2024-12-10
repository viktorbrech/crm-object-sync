"use strict";

const { faker } = require("@faker-js/faker");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const data = Array.from({ length: 10 }).map(() => ({
    first_name: faker.person.firstName(),
    last_name: faker.person.lastName(),
    email: faker.internet.email().toLowerCase()
}));

async function main() {
    console.log(`=== Generated ${data.length} contacts ===`);
    for (const contact of data) {
        await prisma.contacts.create({
            data: contact,
        });
    }
}

main()
    .catch((e) => {
        console.error(e);
    process.exit(1);
})
    .finally(() => {
    prisma.$disconnect();
});
