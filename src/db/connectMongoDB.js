import mongoose from "mongoose";
import { Note } from "../models/note.js";

export async function connectMongoDB() {
    try {
        const mongourl = process.env.MONGO_URL;
        await mongoose.connect(mongourl);
        await Note.syncIndexes();
        console.log("✅ MongoDB connection established successfully");
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}