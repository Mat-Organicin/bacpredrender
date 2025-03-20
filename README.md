# BacPred - Bacteriocin Prediction Tool

A Flask web application for predicting and analyzing bacteriocin sequences.

## Deployment on Render

This application is configured for deployment on Render.com using the included `render.yaml` file.

### Important Configuration Notes

1. **Database Configuration**
   - The application requires PostgreSQL
   - Make sure to set up a PostgreSQL database on Render
   - The `DATABASE_URL` environment variable will be automatically set by Render

2. **Environment Variables**
   - `SECRET_KEY`: For Flask session security (automatically generated)
   - `FLASK_ENV`: Set to 'production' for deployment
   - `PYTHON_VERSION`: Set to match the version used during development

3. **Troubleshooting Common Issues**

   - **Database Connection Errors**:
     - Check that the PostgreSQL instance is running
     - Verify SSL is properly configured (sslmode=require)
   
   - **Model Loading Errors**:
     - Ensure scikit-learn version in requirements.txt matches the version used to train the model
     - Check that model files are correctly uploaded to Render
   
   - **Static Files Not Found**:
     - Verify paths in templates are correct (should use relative paths `/static/...`)
     - Check that the static directory exists and has the right permissions

4. **Maintenance**
   - Monitor the app using Render logs
   - Check for database connection pooling issues if the app becomes unresponsive

## Local Development

1. Clone the repository
2. Install requirements: `pip install -r requirements.txt`
3. Run the app locally: `python run_app.py`
4. Access at http://127.0.0.1:8091 