# WhatsApp Chat Backup: Never Lose Your Conversations Again

My Android phone soft-bricked overnight. The only immediate replacement was an iPhone. That's when I discovered a problem: The WhatsApp chat history were trapped, having no way to recover them.

This project is one way to overcome the problem. Built using Baileys and PostgreSQL, this project creates a self-hosted backup system that ensures you never lose your conversations to hardware failure or platform lock-in again.

The application serves a dual purpose: the backend for [whatsapp-status-sender-webapp](https://github.com/munirrani/whatsapp-status-sender-webapp) and automatically backing up all your messages and media to give you complete control over your data.

## Features

- **Send WhatsApp Statuses**:
    -   `POST /text` endpoint to send text-based statuses.
    -   `POST /media` endpoint to send media (image, video, audio) statuses.
- **Automated Message Backup**:
    -   Stores all incoming WhatsApp messages in a PostgreSQL database.
    -   Automatically downloads and saves associated media files (images, videos, audio, etc.).
- **Structured Data Storage**:
    -   Uses a proper database schema with relationships for contacts, chats, and messages.
    -   Messages are indexed for efficient querying directly against the database.
- **Recipient Group Management**:
    -   `GET /list` endpoint to retrieve available recipient groups for statuses.
- **Graceful Shutdown**: Handles application shutdown cleanly.

## Setup

This project is designed to run with Docker and Docker Compose for a consistent and reproducible environment.

### 1. Configure Environment Variables

First, copy the example environment file:

```bash
cp .env.example .env
```

Next, edit the `.env` file with your PostgreSQL database credentials and any other required settings.

```dotenv
DB_HOST=postgres_db
DB_PORT=5432
DB_NAME=whatsapp_backup
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_SSL=false
```

### 2. Build and Run the Application

With Docker and Docker Compose installed, run the following command from the project root:

```bash
docker-compose up -d --build
```

This will build the application image and start the Node.js application and PostgreSQL containers.

### 3. Initialize Database Schema

Once the containers are running, you need to initialize the database schema.

First, copy the schema file into the PostgreSQL container:

```bash
docker cp ./database.sql postgres_db:/database.sql
```

Then, execute the SQL script to create the tables. Replace `your_user` and `your_db` with the `DB_USER` and `DB_NAME` values from your `.env` file.

```bash
docker exec -i postgres_db psql -U your_user -d your_db -f /database.sql
```

The application should now be running and connected to the database. You can view logs using `docker-compose logs -f`.

## API Endpoints

The application provides the following HTTP endpoints to interact with WhatsApp.

#### Send a text status

-   **Endpoint**: `POST /text`
-   **Description**: Sends a text message as a WhatsApp status to specific recipient groups.
-   **Body**:
    ```json
    {
      "message": "Hello from the API!",
      "selectedRecipientGroup": [1, 2],
      "backgroundColor": "#212121",
      "fontNumber": 3
    }
    ```
-   **Details**:
    -   `selectedRecipientGroup`: An array of numbers corresponding to the recipient groups returned by the `GET /list` endpoint. The status will be broadcast to the JIDs (phone numbers) in these groups.
    -   `backgroundColor`: (Optional) The background color for the text status.
    -   `fontNumber`: (Optional) The font to use for the text status.

#### Send a media status

-   **Endpoint**: `POST /media`
-   **Description**: Sends a media file (image, video, audio) as a WhatsApp status. This is a multipart/form-data request.
-   **Form Fields**:
    -   `selectedRecipientGroup`: A JSON stringified array of numbers (e.g., `"[1, 2]"`) corresponding to the recipient groups from `GET /list`.
    -   `caption`: (Optional) The caption for the media.
    -   `file`: The media file to upload.
    -   `backgroundColor`: (Optional) The background color for the status.

#### List recipient groups

-   **Endpoint**: `GET /list`
-   **Description**: Retrieves a list of available recipient groups for sending statuses. Each group has a name and can be referenced by its position (index + 1) in the `selectedRecipientGroup` array when sending a status.

#### Get the latest status

-   **Endpoint**: `GET /latest-status`
-   **Description**: Retrieves the text content of the most recently sent status from the database.

## Media Storage

Incoming media files are automatically downloaded and stored in the `media` directory *inside the Docker container*. This directory is mapped to the `media_data` directory on the host machine, as configured in `docker-compose.yml`. This ensures media files persist even if the container is removed.

## Database Schema

The application uses the following main tables to store data:

-   `users` - Contact information
-   `chats` - Individual and group chats
-   `messages` - All backed-up messages with metadata
-   `media_attachments` - Media files with references to messages

## File Structure

```
src/
├── config/
│   └── index.ts          # Configuration including database settings
├── services/
│   ├── baileysClient.ts   # WhatsApp client with database integration
│   ├── databaseService.ts # Database operations for messages and media
│   └── ...
├── utils/
│   └── database.ts       # Database connection and utilities
└── app.ts               # Main application entry point
```

## Troubleshooting

1.  **Database Connection Issues**: Ensure the PostgreSQL container is running (`docker ps`) and that the credentials in your `.env` file are correct.
2.  **Media Download Failures**: Check permissions for the `media_data` directory on your host machine.
3.  **Message Duplication**: The system automatically handles deduplication for incoming messages using their unique WhatsApp message IDs.

## License

This project is for educational and personal use only. Please respect WhatsApp's Terms of Service.