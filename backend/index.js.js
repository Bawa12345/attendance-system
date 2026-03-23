// index.js
const { initializeApp } = require("firebase/app");
const { 
  getFirestore, collection, addDoc, getDocs, 
  doc, updateDoc, deleteDoc 
} = require("firebase/firestore");

// Your Firebase config (from Firebase Console)
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

// CREATE
async function addUser() {
  const docRef = await addDoc(collection(db, "users"), {
    name: "Bawantha",
    role: "Developer"
  });
  console.log("User added with ID:", docRef.id);
}

// READ
async function getUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  snapshot.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

// UPDATE
async function updateUser(userId) {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, { role: "Admin" });
  console.log("User updated successfully!");
}

// DELETE
async function deleteUser(userId) {
  await deleteDoc(doc(db, "users", userId));
  console.log("User deleted successfully!");
}

async function updateAllUsers() {
    const snapshot = await getDocs(collection(db, "users"));
    snapshot.forEach(async docSnap => {
      const userRef = doc(db, "users", docSnap.id);
      await updateDoc(userRef, { role: "Admin" });
      console.log("Updated:", docSnap.id);
    });
  }
  
  async function deleteAllUsers() {
    const snapshot = await getDocs(collection(db, "users"));
    snapshot.forEach(async docSnap => {
      await deleteDoc(doc(db, "users", docSnap.id));
      console.log("Deleted:", docSnap.id);
    });
  }
  
// Example calls
(async () => {
  await addUser();             // Create
  await getUsers();            // Read
  await updateUser("zw9cUO2ymerPnabwahX7");  // Update (replace with real ID)
  await deleteUser("zw9cUO2ymerPnabwahX7");  // Delete (replace with real ID)
  await updateAllUsers("zw9cUO2ymerPnabwahX7");  // Delete (replace with real ID)
  await deleteAllUsers("zw9cUO2ymerPnabwahX7");  // Delete (replace with real ID)
})();
