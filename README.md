# Aristotle — Next.js frontend + Flask backend (AWS example)

This workspace contains a minimal Next.js frontend and a Flask backend that demonstrates calling AWS S3 using boto3.

Project layout:

- frontend/ — Next.js app (calls backend at http://localhost:6767/api/aws/buckets)
- backend/ — Flask app exposing an endpoint to list S3 buckets
- backend/.env.example, frontend/.env.example — per-service env templates (do NOT commit real `.env` files)


## Quick start (Windows PowerShell)

### Prerequisites

- Node.js 18+ (npm included) — used for the frontend
- Python 3.11+ and pip — used for the backend
- Optional: AWS CLI if you prefer `aws configure` instead of editing `.env` files


### Run backend locally (recommended for development)

Open PowerShell and run the following from the `backend` folder:

```powershell
# from repository root:
cd backend

# create & activate a venv (creates .venv inside backend)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# install backend deps
pip install -r requirements.txt

# FIRST TIME: Create a local backend/.env from the example and edit it (do NOT commit backend/.env)
Copy-Item .\.env.example .\.env
notepad .\.env   # set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (or leave blank to use aws CLI / IAM)

# run the app
python app.py
```

Notes:
- If you prefer a repo-level venv, create it at the project root and adjust activation paths.
- Alternatively, run `aws configure` and leave the AWS keys blank in `.env` — boto3 will pick up credentials from `~/.aws/`.


### Run frontend locally

Open a new PowerShell (frontend runs separately) and run:

```powershell
cd frontend

# Optional: create frontend/.env from the example for a persistent local override.
# If you want to change the backend URL without editing code, set NEXT_PUBLIC_BACKEND_URL.
Copy-Item .\.env.example .\.env
notepad .\.env   # set NEXT_PUBLIC_BACKEND_URL if needed (e.g. http://localhost:6767)

# install dependencies
npm install

# run dev server
npm run dev
```

Then open http://localhost:3000 to view the frontend.

Notes:
- For Next.js, public env vars must be prefixed with `NEXT_PUBLIC_` to be available in browser code. Restart the dev server after changing `frontend/.env`.
- The frontend falls back to `http://localhost:6767` if `NEXT_PUBLIC_BACKEND_URL` is not set.


### Local test (no AWS required)

The backend includes a small test that uses botocore Stubber to stub S3 calls for unit testing (no network or AWS credentials required).

```powershell
# from repository root
cd backend
python -m pip install -r requirements.txt
```

Expected output:
- `stubber test passed` if the test succeeds.


## .env examples

See `backend/.env.example` and `frontend/.env.example` for templates of required variables. Commit only the `*.env.example` templates — never commit real `.env` files.


## Troubleshooting

- If you get AWS auth errors, ensure credentials are set via environment variables, `aws configure`, or an IAM role when running in AWS.
- If the frontend can't reach the backend, ensure the backend is running on port 6767 and check Windows Firewall rules.
- CORS: the backend enables CORS for local dev. For production, restrict origins.
- Windows PowerShell: use `Activate.ps1` to activate venv. If execution policy blocks scripts, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` as admin.


## Next steps

- Add authentication and stricter CORS rules for production.
- Add unit tests and CI pipeline.
- Replace direct fetch with a typed client or SWR in the frontend.
