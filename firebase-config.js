// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAiqLJR9b-YCWkyWoqHmxyUx91oxWNssM4",
  authDomain: "accounting-system-ba6e6.firebaseapp.com",
  projectId: "accounting-system-ba6e6",
  storageBucket: "accounting-system-ba6e6.firebasestorage.app",
  messagingSenderId: "968875466611",
  appId: "1:968875466611:web:4ea5dab35c015884236f06",
  measurementId: "G-RNSLEH8Y3E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);