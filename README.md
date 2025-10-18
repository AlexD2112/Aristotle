# Aristotle — Next.js frontend + Flask backend (AWS example)

This workspace contains a minimal Next.js frontend and a Flask backend that demonstrates calling AWS S3 using boto3.

Project layout:

- frontend/ — Next.js app (calls backend at http://localhost:5000/api/aws/buckets)
- backend/ — Flask app exposing an endpoint to list S3 buckets
- docker-compose.yml — optional compose to run both services
- .env.example — example env vars


## Quick start (Windows PowerShell)

### Prerequisites

- Node.js (for frontend)
- Python 3.11+
- pip
- Optional: Docker & Docker Compose


### Run backend locally (recommended for development)

Open PowerShell in the project root and run:

```powershell
# create and activate a venv
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# install backend deps
cd backend
pip install -r requirements.txt

# set AWS credentials (one-time, example)
$env:AWS_ACCESS_KEY_ID = "YOUR_ACCESS_KEY"
$env:AWS_SECRET_ACCESS_KEY = "YOUR_SECRET_KEY"
$env:AWS_REGION = "us-east-1"

# run the app
python app.py
```

By default the backend listens on http://0.0.0.0:5000.


### Run frontend locally

Open a new PowerShell (frontend runs separately):

```powershell
cd frontend
# install dependencies
npm install
# run dev server
npm run dev
```

Then open http://localhost:3000 to view the frontend. It will call the backend at http://localhost:5000/api/aws/buckets.


### Run with Docker Compose

If you prefer Docker, run from the project root:

```powershell
docker-compose up --build
```

The frontend will be at http://localhost:3000 and backend at http://localhost:5000.


## Testing with Moto (mock AWS)

If you don't want to use real AWS credentials for local testing, the backend includes a small test using moto.

```powershell
# from project root
cd backend
python -m pip install -r requirements.txt
python test_moto.py
```

If the test prints `moto test passed`, moto successfully mocked S3.


## .env.example

See `.env.example` for variables you may want to set. You can also use `python-dotenv` in development; the Flask app loads environment variables from a `.env` file automatically.


## Troubleshooting

- If you get AWS auth errors, ensure credentials are set via environment variables, `aws configure`, or an IAM role when running in AWS.
- CORS: the backend enables CORS for local dev. For production, restrict origins.
- Windows PowerShell: use `Activate.ps1` to activate venv. If execution policy blocks scripts, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` as admin.


## Next steps

- Add authentication and stricter CORS rules for production.
- Add unit tests and CI pipeline.
- Replace direct fetch with a typed client or SWR in the frontend.
