// firebase.js
const { initializeApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");

// Paste your config here
const firebaseConfig = {
    apiKey: "AIzaSyDA2FKfaMsHuzE7G_ZQOiuMGRAK2r_YABU",
    authDomain: "webss-b3d6c.firebaseapp.com",
    projectId: "webss-b3d6c",
    storageBucket: "webss-b3d6c.firebasestorage.app",
    messagingSenderId: "733352621177",
    appId: "1:733352621177:web:8798223c0c8499329c10a8",
    measurementId: "G-T270N7QSSM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = db;
