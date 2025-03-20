# Deploying to Render

This document provides step-by-step instructions for deploying the BacPred application to Render.

## Prerequisites

- A Render account (sign up at https://render.com)
- Your application code in a Git repository (GitHub, GitLab, etc.)

## Deployment Steps

### 1. Prepare Your Codebase

Ensure your project has the following files:
- `requirements.txt` - Lists all Python dependencies
- `render.yaml` - Configuration for Render
- `wsgi.py` - Entry point for Gunicorn
- `gunicorn_config.py` - Gunicorn server configuration
- `Procfile` - Defines the web process

All these files are already set up in the repository.

### 2. Deploy to Render via Web Interface

1. Log in to your Render account at https://dashboard.render.com
2. Click on "New" and select "Web Service"
3. Connect your GitHub/GitLab repository or use the "Public Git repository" option
4. Enter the repository URL if using the public option
5. Configure your service:
   - **Name**: bacpred (or your preferred name)
   - **Environment**: Python
   - **Region**: Oregon (or your preferred region)
   - **Branch**: main (or your current branch)
   - **Build Command**: `pip install -r requirements.txt && mkdir -p logs && mkdir -p uploads && python -c "import database; print('Database initialized')"`
   - **Start Command**: `gunicorn -c gunicorn_config.py wsgi:app --bind=0.0.0.0:$PORT`
   - **Plan**: Starter (or your preferred plan)
6. Set up Environment Variables:
   - `FLASK_ENV`: production
   - `PYTHON_VERSION`: 3.9.0
   - `SECRET_KEY`: (Render can generate this automatically or provide your own)
7. Click "Create Web Service"

Render will automatically start the deployment process.

### 3. Monitor Deployment

1. Render will show a log of the build and deployment process
2. Once deployed, your service will be accessible at `https://your-service-name.onrender.com`
3. You can view logs and configure additional settings in the Render dashboard

### 4. Troubleshooting

If you encounter issues:
1. Check the build logs for errors
2. Verify your `requirements.txt` includes all dependencies
3. Make sure your `gunicorn_config.py` is correctly configured
4. Ensure the application code runs locally without errors

### 5. Ongoing Maintenance

- Set up automatic deploys from your repository
- Monitor logs regularly
- Set up health checks at `/healthz` endpoint
- Consider upgrading plans if needed for better performance

## Additional Resources

- [Render Python Documentation](https://render.com/docs/deploy-python)
- [Render Environment Variables](https://render.com/docs/environment-variables)
- [Render YAML Specification](https://render.com/docs/yaml-spec) 