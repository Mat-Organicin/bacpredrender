# BacPred Deployment Guide

This guide explains how to deploy the BacPred application in a production environment.

## Prerequisites

- Python 3.9+
- PostgreSQL
- Nginx
- A domain name (optional, but recommended)
- Server with sufficient resources (at least 2GB RAM recommended)

## Installation Steps

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/bacpred.git
cd bacpred
```

### 2. Install required packages

```bash
pip install -r requirements.txt
pip install gunicorn gevent
```

### 3. Set up environment variables

Create a `.env` file in the project root with the following variables:

```
SECRET_KEY=your_secure_secret_key
DB_HOST=localhost
DB_PORT=5432
DB_NAME=biofasta
DB_USER=yourusername
DB_PASSWORD=yourpassword
FLASK_ENV=production
```

### 4. Set up the database

Make sure PostgreSQL is installed and running, then:

```bash
sudo -u postgres psql
```

In the PostgreSQL shell:

```sql
CREATE DATABASE biofasta;
CREATE USER yourusername WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE biofasta TO yourusername;
```

### 5. Configure Nginx

1. Copy the provided Nginx configuration file to the Nginx directory:

```bash
sudo cp biofasta/nginx.conf /etc/nginx/sites-available/bacpred
```

2. Edit the configuration to match your setup:

```bash
sudo nano /etc/nginx/sites-available/bacpred
```

3. Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/bacpred /etc/nginx/sites-enabled/
sudo nginx -t  # Test the configuration
sudo systemctl restart nginx
```

### 6. Set up SSL (recommended)

Use Let's Encrypt for free SSL certificates:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 7. Configure systemd service

1. Copy the service file to systemd:

```bash
sudo cp biofasta/bacpred.service /etc/systemd/system/
```

2. Edit the service file to match your setup:

```bash
sudo nano /etc/systemd/system/bacpred.service
```

3. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bacpred
sudo systemctl start bacpred
sudo systemctl status bacpred  # Check status
```

### 8. Monitor the application

Check the logs to monitor the application:

```bash
tail -f biofasta/logs/error.log
tail -f biofasta/logs/access.log
```

## Port Forwarding and Firewall Configuration

For the application to be accessible from the internet:

1. Configure your firewall to allow incoming HTTP (80) and HTTPS (443) traffic:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

2. If you're behind a router, set up port forwarding to route traffic from ports 80 and 443 to your server.

## Updating the Application

To update the application:

1. Pull the latest changes:

```bash
cd /path/to/bacpred
git pull
```

2. Restart the service:

```bash
sudo systemctl restart bacpred
```

## Troubleshooting

- **Application won't start**: Check the logs in the `logs` directory
- **Database connection issues**: Verify PostgreSQL is running and credentials are correct
- **Permission errors**: Ensure proper file permissions for the application directory
- **Nginx errors**: Check Nginx logs at `/var/log/nginx/error.log`

## Security Considerations

- Keep your server and packages updated
- Use strong passwords and a unique SECRET_KEY
- Consider implementing rate limiting
- Regularly backup your database
- Use HTTPS only in production
- Consider using a restricted user for running the application

## Quick Start

For a quick test of the production setup without Nginx, run:

```bash
cd biofasta
./start_production.sh
```

This will start Gunicorn on port 5002. 