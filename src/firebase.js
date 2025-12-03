import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FIREBASE_SERVICE_ACCOUNT_KEY, FIREBASE_PROJECT_ID } from './config.js';
import { logger } from './utils/logger.js';

let db;

try {
    if (getApps().length === 0) {
        if (FIREBASE_SERVICE_ACCOUNT_KEY) {
            const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_KEY);
            initializeApp({
                credential: cert(serviceAccount),
                projectId: FIREBASE_PROJECT_ID
            });
            logger.info('Firebase Admin initialized with service account');
        } else {
            // Fallback to default credentials (useful for local dev if set up, or cloud run)
            initializeApp({
                projectId: FIREBASE_PROJECT_ID
            });
            logger.info('Firebase Admin initialized with default credentials');
        }
    }

    db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });

} catch (error) {
    logger.error('Failed to initialize Firebase Admin', error);
}

export { db };
