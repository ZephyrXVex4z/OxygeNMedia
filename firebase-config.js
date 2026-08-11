// firebase-config.js
// Configuración e inicialización compartida de Firebase para todo el sitio

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBzNGKHaIPA_PoUP1A5q-AH1yoLMpvHQ84",
  authDomain: "workwebschool-5646f.firebaseapp.com",
  projectId: "workwebschool-5646f",
  storageBucket: "workwebschool-5646f.firebasestorage.app",
  messagingSenderId: "967667603982",
  appId: "1:967667603982:web:48f08be006cdf659fa7a5f",
  measurementId: "G-BKV1DHPBKY"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
