# Quick Deployment Guide for Testing

This guide will help you quickly deploy BacPred for temporary public access using ngrok.

## Option 1: Using ngrok (Temporary Access)

### 1. Install ngrok

Download ngrok from [https://ngrok.com/download](https://ngrok.com/download) and follow the installation instructions for your operating system.

### 2. Start the BacPred application

From the project directory:

```bash
cd biofasta
./start_production.sh
```

This will start Gunicorn on port 5002.

### 3. In a separate terminal, start ngrok

```bash
ngrok http 5002
```

ngrok will provide you with a public URL (something like `https://a1b2c3d4.ngrok.io`) that anyone can use to access your application.

## Option 2: Port Forwarding (Home Network)

If you're on a home network and want to make the application available:

1. Find your computer's local IP address:
   ```bash
   # On macOS/Linux
   ifconfig | grep "inet "
   
   # On Windows
   ipconfig
   ```

2. Configure your router to forward port 5002 to your computer's local IP address.
   - Log into your router's admin panel (typically 192.168.1.1 or similar)
   - Find the "Port Forwarding" section
   - Create a new rule forwarding external port 5002 to internal port 5002 on your computer's IP

3. Find your public IP address:
   ```bash
   curl ifconfig.me
   ```

4. Users can now access your application at `http://[your-public-ip]:5002`

## Option 3: Simple Production Setup

For a more permanent but simple production deployment:

1. Obtain a VPS from a provider like DigitalOcean, AWS, or Google Cloud
2. Follow the steps in DEPLOYMENT.md
3. Use a domain name with proper SSL certificates

## Important Notes

- These temporary solutions are not secure for long-term production use
- They don't provide SSL encryption by default (except ngrok)
- The application will only be available while your computer is running
- For a permanent deployment, use a proper server setup with Nginx as described in DEPLOYMENT.md 