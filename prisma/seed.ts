import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/*Create dataset, mapping over an array*/
const data: Prisma.ContactsCreateManyInput[] = Array.from({ length: 10 }).map(
  () => ({
    first_name: faker.person.firstName(),
    last_name: faker.person.lastName(),

    email: faker.internet.email().toLowerCase() //normalize before adding to db

  })
);

/*Run seed command and the function below inserts data in the database*/
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
    console.log(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
