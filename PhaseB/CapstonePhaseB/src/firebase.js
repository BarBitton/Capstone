// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";


const firebaseConfig = {
  apiKey: "AIzaSyA3JrusIBtkJmmKtNeaem42YIp2NPwx1kw",
  authDomain: "capstonephaseb-ftt.firebaseapp.com",
  projectId: "capstonephaseb-ftt",
  storageBucket: "capstonephaseb-ftt.firebasestorage.app",
  messagingSenderId: "250039128652",
  appId: "1:250039128652:web:63d36d0d0bb0e5cdf59ae9",
  measurementId: "G-SJEVZQ9HS7",
};

// אתחול Firebase פעם אחת בכל האפליקציה
const app = initializeApp(firebaseConfig);

// יצוא של ה־services שנשתמש בהם
export const db = getFirestore(app);
export const auth = getAuth(app);
