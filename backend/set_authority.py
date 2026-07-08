import firebase_admin
from firebase_admin import credentials, auth
import os 
from dotenv import load_dotenv

load_dotenv()

cred=credentials.Certificate(os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH"))
firebase_admin.initialize_app(cred)

UID="hHw1sKWUqrgSd5EVUAvD8J0uoIF3"

auth.set_custom_user_claims(UID, {"role":"authority"})
print(f"{UID} now has role: authority")