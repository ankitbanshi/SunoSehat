import { MongoClient } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

export async function getMongoDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");

  if (!globalForMongo.mongoClientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    globalForMongo.mongoClientPromise = client.connect();
  }

  const client = await globalForMongo.mongoClientPromise;
  return client.db("sunosehat");
}
