import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyAbfBko2eT9x0ycfpuRipKCo2sDX-jbPcE",
    authDomain: "prakritiprahari-5ca46.firebaseapp.com",
    projectId: "prakritiprahari-5ca46",
    storageBucket: "prakritiprahari-5ca46.firebasestorage.app",
    messagingSenderId: "799034459841",
    appId: "1:799034459841:web:e62f0d25215988999cb640",
    measurementId: "G-J40MVKZWHY"
};

import { getFirestore } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Ensures every visitor has a signed-in (anonymous) identity before they
// can submit or resolve a report. Citizens never see this happen.
export function ensureSignedIn() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                resolve(user);
            } else {
                signInAnonymously(auth).then((result) => resolve(result.user));
            }
        });
    });
}

// Grabs a fresh ID token for the current user - call this right before
// any request that needs to prove identity.
export async function getIdToken() {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
}

// Signs in an authority account with email + password.
// Throws a Firebase error on failure (wrong password, user not found, etc.)
export async function signInAsAuthority(email, password) {
    return await signInWithEmailAndPassword(auth, email, password);
}

// Signs out the authority account and restores an anonymous citizen session.
export async function signOutAuthority() {
    await signOut(auth);
    await ensureSignedIn();
}

export { auth, db, onAuthStateChanged };