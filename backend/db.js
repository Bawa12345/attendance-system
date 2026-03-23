const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

// Supports both local file (dev) and environment variable (cloud/Render.com)
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // On Render.com: paste the entire serviceAccountKey.json content as this env var
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Local development: uses the actual key file
  serviceAccount = require('./serviceAccountKey.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "bawa-57856.appspot.com"
});

const db = admin.firestore();

// Create default admin user if not exists
async function initializeDB() {
    const adminRef = db.collection('users').doc('admin');
    const doc = await adminRef.get();
    if (!doc.exists) {
        const adminPass = bcrypt.hashSync('admin123', 8);
        await adminRef.set({
            username: 'admin',
            password: adminPass,
            role: 'admin',
            active: 1
        });
        console.log("Created default admin user");
    }
}
initializeDB();

module.exports = db;
