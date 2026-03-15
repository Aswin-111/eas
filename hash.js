const bcrypt = require('bcrypt');

/**
 * Hashes a password using bcryptjs
 * @param {string} password - The plain text password to hash
 * @param {number} saltRounds - Number of salt rounds (default: 10)
 * @returns {Promise<string>} - The hashed password
 */
async function hashPassword(password, saltRounds = 10) {
    try {
        // Generate salt
        const salt = await bcrypt.genSalt(saltRounds);

        // Hash password with the generated salt
        const hash = await bcrypt.hash(password, salt);

        return hash;
    } catch (error) {
        throw new Error(`Error hashing password: ${error.message}`);
    }
}

// Alternative: Direct hashing (bcrypt handles salt generation internally)
async function hashPasswordDirect(password, saltRounds = 10) {
    try {
        const hash = await bcrypt.hash(password, saltRounds);
        return hash;
    } catch (error) {
        throw new Error(`Error hashing password: ${error.message}`);
    }
}

// Synchronous version (not recommended for production)
function hashPasswordSync(password, saltRounds = 10) {
    try {
        const salt = bcrypt.genSaltSync(saltRounds);
        const hash = bcrypt.hashSync(password, salt);
        return hash;
    } catch (error) {
        throw new Error(`Error hashing password: ${error.message}`);
    }
}

// Password verification function
async function verifyPassword(password, hash) {
    try {
        const isMatch = await bcrypt.compare(password, hash);
        return isMatch;
    } catch (error) {
        throw new Error(`Error verifying password: ${error.message}`);
    }
}

// Example usage
(async () => {
    const userPassword = '1234';

    // Hash the password
    const hashedPassword = await hashPassword(userPassword);
    console.log('Hashed password:', hashedPassword);

    // Verify the password
    const isValid = await verifyPassword(userPassword, hashedPassword);
    console.log('Password valid:', isValid); // true

    const isInvalid = await verifyPassword('wrongPassword', hashedPassword);
    console.log('Wrong password:', isInvalid); // false
})();


db.usermasts.insertOne({
    comp_code: "1002",
    user_id: "2",
    user_name: "user123",
    user_password: "$2b$10$.uE/0f2nTxqv.Rw/lFNDV.dBN3bI3PEoGZJ1hkVNZoppcfi/tY5ES",
    user_type: "1",
    createdAt: new Date(),
    updatedAt: new Date()
})
