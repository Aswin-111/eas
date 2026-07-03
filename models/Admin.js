import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
        },
    }
);

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;

// use ezbiz;

// db.admins.insertOne({
//     username: "admin",
//     password: "$2a$10$yO/6fhvUzOG1eq4SKEx4u.mPkdPc25Fz7oOBHvswcpZUgtiQo1PW2", // bcrypt hash
//     createdAt: new Date(),
//     updatedAt: new Date()
// });

// node - e "console.log(require('bcryptjs').hashSync('9072999927@!@#$%^&###%&&', 10))"