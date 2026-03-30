import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as updateAuthProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { notificationService } from '../services/notificationService';
import { UserRole, UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string) => Promise<void>;
  adminCreateUser: (email: string, pass: string, name: string, role: UserRole) => Promise<string>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (data: { displayName?: string; phoneNumber?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setAuthError(null);
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.exists()) {
            const isAdminEmail = currentUser.email === "aminehasni20@gmail.com";
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email!,
              displayName: currentUser.displayName || 'Utilisateur',
              role: isAdminEmail ? 'admin' : 'warehouseman',
              createdAt: new Date().toISOString(),
              lastLogin: new Date().toISOString()
            };
            await setDoc(userRef, newProfile);
            setProfile(newProfile);
          } else {
            const existingProfile = userSnap.data() as UserProfile;
            if (existingProfile.isPaused) {
              await signOut(auth);
              setProfile(null);
              setAuthError("Vous êtes en pause.");
              return;
            }
            const isAdminEmail = currentUser.email === "aminehasni20@gmail.com";
            
            let finalRole = existingProfile.role;
            if (isAdminEmail && existingProfile.role !== 'admin') {
              finalRole = 'admin';
              await updateDoc(userRef, { role: 'admin', lastLogin: new Date().toISOString() });
            } else {
              await updateDoc(userRef, { lastLogin: new Date().toISOString() });
            }
            
            setProfile({ 
              ...existingProfile, 
              role: finalRole,
              lastLogin: new Date().toISOString() 
            });
          }
        } else {
          setProfile(null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'users');
      } finally {
        setUser(currentUser);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      handleAuthError(error);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      handleAuthError(error);
    }
  };

  const register = async (email: string, pass: string, name: string) => {
    setAuthError(null);
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateAuthProfile(res.user, { displayName: name });
      
      const userRef = doc(db, 'users', res.user.uid);
      await setDoc(userRef, {
        uid: res.user.uid,
        email: email,
        displayName: name,
        role: 'warehouseman',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      });

      // Send welcome notification to the new user
      await notificationService.sendNotification({
        userId: res.user.uid,
        title: 'Bienvenue !',
        message: 'Merci de vous être inscrit. Votre compte est en attente de validation par un administrateur.',
        type: 'info'
      });
    } catch (error: any) {
      handleAuthError(error);
    }
  };

  const adminCreateUser = async (email: string, pass: string, name: string, role: UserRole) => {
    setAuthError(null);
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateAuthProfile(res.user, { displayName: name });
      
      const userRef = doc(db, 'users', res.user.uid);
      const newProfile: UserProfile = {
        uid: res.user.uid,
        email: email,
        displayName: name,
        role: role,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      await setDoc(userRef, newProfile);
      return res.user.uid;
    } catch (error: any) {
      handleAuthError(error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      handleAuthError(error);
    }
  };

  const handleAuthError = (error: any) => {
    console.error("Auth error:", error);
    if (error.code === 'auth/popup-blocked') {
      setAuthError("Le popup de connexion a été bloqué. Veuillez autoriser les fenêtres surgissantes.");
    } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      setAuthError("Email ou mot de passe incorrect.");
    } else if (error.code === 'auth/email-already-in-use') {
      setAuthError("Cet email est déjà utilisé. Veuillez vous connecter ou utiliser un autre email.");
    } else {
      setAuthError(error.message);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateProfileMethod = async (data: { displayName?: string; phoneNumber?: string }) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userRef, data);
      if (data.displayName) {
        await updateAuthProfile(user, { displayName: data.displayName });
      }
      setProfile(prev => prev ? { ...prev, ...data } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      authError, 
      login, 
      loginWithEmail, 
      register, 
      adminCreateUser,
      resetPassword, 
      updateProfile: updateProfileMethod,
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
