import firebase_admin
from firebase_admin import credentials, auth
import os 
from dotenv import load_dotenv

load_dotenv()

cred=credentials.Certificate(os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH"))
firebase_admin.initialize_app(cred)

UID="AxscOVc0SGTnQsPMfRfuNHXzXS42"

auth.set_custom_user_claims(UID, None)

auth.set_custom_user_claims(UID, {"role":"authority"})
print(f"{UID} now has role: authority")
user = auth.get_user(UID)
print(f"after setting: {user.custom_claims}")
