import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FIREBASE_SERVICE_ACCOUNT_KEY, FIREBASE_PROJECT_ID } from './config.js';
import { logger } from './utils/logger.js';

let db = null;
let isInitialized = false;

try {
    // Log configuration status (without exposing sensitive data)
    logger.info('Firebase initialization starting', {
        hasServiceAccountKey: !!FIREBASE_SERVICE_ACCOUNT_KEY,
        hasProjectId: !!FIREBASE_PROJECT_ID,
        projectId: FIREBASE_PROJECT_ID || 'not set',
        existingApps: getApps().length
    });

    if (getApps().length === 0) {
        if (FIREBASE_SERVICE_ACCOUNT_KEY) {
            try {
                const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_KEY);
                // Validate required fields
                if (!serviceAccount.project_id && !FIREBASE_PROJECT_ID) {
                    throw new Error('Service account missing project_id and FIREBASE_PROJECT_ID not set');
                }
                if (!serviceAccount.private_key) {
                    throw new Error('Service account missing private_key');
                }
                if (!serviceAccount.client_email) {
                    throw new Error('Service account missing client_email');
                }
                
                initializeApp({
                    credential: cert(serviceAccount),
                    projectId: FIREBASE_PROJECT_ID || serviceAccount.project_id
                });
                logger.info('Firebase Admin initialized with service account', {
                    projectId: FIREBASE_PROJECT_ID || serviceAccount.project_id,
                    clientEmail: serviceAccount.client_email
                });
            } catch (parseError) {
                logger.error('Failed to parse or validate FIREBASE_SERVICE_ACCOUNT_KEY', parseError, {
                    errorType: parseError.name,
                    errorMessage: parseError.message
                });
                throw parseError;
            }
        } else if (FIREBASE_PROJECT_ID) {
            // Fallback to default credentials (useful for local dev if set up, or cloud run)
            initializeApp({
                projectId: FIREBASE_PROJECT_ID
            });
            logger.info('Firebase Admin initialized with default credentials', {
                projectId: FIREBASE_PROJECT_ID
            });
        } else {
            const error = new Error('FIREBASE_PROJECT_ID is required but not set. Also, FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
            logger.error('Firebase configuration missing', error);
            throw error;
        }
    } else {
        logger.info('Firebase Admin app already initialized');
    }

    db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
    
    isInitialized = true;
    logger.info('Firebase Firestore initialized successfully');

    // Test the connection asynchronously (non-blocking)
    db.collection('_health_check').limit(1).get()
        .then(() => {
            logger.info('Firebase Firestore connection verified successfully');
        })
        .catch((error) => {
            logger.error('Firebase Firestore connection test failed', error, {
                errorCode: error.code,
                errorMessage: error.message,
                errorDetails: error.details
            });
            // Don't set isInitialized to false here, as the connection might work later
            // The actual operations will handle errors appropriately
        });

} catch (error) {
    logger.error('Failed to initialize Firebase Admin', error, {
        errorCode: error.code,
        errorMessage: error.message,
        errorStack: error.stack
    });
    db = null;
    isInitialized = false;
}

export { db, isInitialized };
