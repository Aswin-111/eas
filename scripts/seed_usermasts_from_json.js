/**
 * scripts/seed_usermasts_from_json.js
 *
 * Usage:
 *   node scripts/seed_usermasts_from_json.js ./scripts/ezbiz.usermasts.json
 *
 * Env:
 *   MONGO_URI=mongodb://localhost:27017/ezbiz
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const SALT_ROUNDS = 10;

// Define schema ONLY for seeding
const UserMastSchema = new mongoose.Schema(
    {
        comp_code: { type: String, required: true },
        user_id: { type: String, required: true },
        user_name: { type: String, required: true },
        user_password: { type: String, required: true },
        user_type: { type: String },
    },
    { collection: "usermasts", timestamps: true }
);

UserMastSchema.index({ comp_code: 1, user_id: 1 }, { unique: true });

const UserMast = mongoose.model("UserMastSeed", UserMastSchema);

function parseJsonFile(raw) {
    const trimmed = raw.trim();

    // Proper JSON array
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        return JSON.parse(trimmed);
    }

    // Mongo export style (objects separated by commas)
    return JSON.parse(`[${trimmed.replace(/,\s*$/, "")}]`);
}

async function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error("❌ Provide JSON file path");
        process.exit(1);
    }

    const absPath = path.resolve(inputPath);
    if (!fs.existsSync(absPath)) {
        console.error("❌ File not found:", absPath);
        process.exit(1);
    }

    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/ezbiz";
    console.log("Mongo URI:", mongoUri);
    console.log("Input file:", absPath);

    const raw = fs.readFileSync(absPath, "utf8");
    const users = parseJsonFile(raw);

    if (!Array.isArray(users) || users.length === 0) {
        console.error("❌ No users found in JSON");
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    let inserted = 0;
    let skipped = 0;

    for (const u of users) {
        try {
            if (!u.comp_code || !u.user_id || !u.user_name || !u.user_password) {
                console.warn("⚠️ Skipping invalid record:", u);
                skipped++;
                continue;
            }

            const hashed = await bcrypt.hash(String(u.user_password), SALT_ROUNDS);

            await UserMast.create({
                comp_code: String(u.comp_code),
                user_id: String(u.user_id),
                user_name: u.user_name,
                user_password: hashed,
                user_type: u.user_type,
            });

            console.log(`✅ Inserted user: ${u.user_name}`);
            inserted++;
        } catch (err) {
            if (err.code === 11000) {
                console.warn(`⚠️ Duplicate skipped: ${u.user_name}`);
                skipped++;
            } else {
                console.error("❌ Error inserting:", u.user_name, err.message);
            }
        }
    }

    console.log("\n---- Summary ----");
    console.log("Inserted:", inserted);
    console.log("Skipped:", skipped);

    await mongoose.disconnect();
    console.log("✅ Done");
}

main().catch(async (err) => {
    console.error("❌ Fatal error:", err);
    try { await mongoose.disconnect(); } catch { }
    process.exit(1);
});
