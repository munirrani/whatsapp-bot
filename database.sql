-- Enable UUID extension if you plan to use UUIDs for primary keys instead of BIGSERIAL
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table for users (contacts) who can be senders
CREATE TABLE users (
    jid TEXT PRIMARY KEY,
    push_name TEXT, -- push_name can change, so it's nullable or we update it often
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for searching users by push_name
CREATE INDEX idx_users_push_name ON users (push_name);

-- Unified table for both individual and group chats
CREATE TABLE chats (
    jid TEXT PRIMARY KEY,
    name TEXT, -- For group subjects or contact names
    is_group BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for searching chats by name/subject
CREATE INDEX idx_chats_name ON chats (name);

-- Table for Messages
CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    whatsapp_message_id TEXT NOT NULL,
    chat_jid TEXT NOT NULL, -- Foreign key to the chats table
    sender_jid TEXT NOT NULL, -- Foreign key to the users table (the author)
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    message_type TEXT NOT NULL, -- e.g. 'text', 'image', 'video', 'audio', 'document', 'reaction', etc
    is_from_me BOOLEAN NOT NULL,
    message_text TEXT, -- For text messages, reactions, or caption of media messages.
    quoted_message_id TEXT, -- Refers to whatsapp_message_id of the quoted message
    reaction_message_id TEXT, -- Refers to whatsapp_message_id of the message being reacted to
    push_name TEXT, -- Denormalized for convenience, primary source is users table
    raw_message_data JSONB NOT NULL,
    is_forwarded BOOLEAN NOT NULL DEFAULT FALSE, -- Indicates if the message was forwarded
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(message_text, '') || ' ' || coalesce(push_name, ''))
    ) STORED, -- Full-text search vector for message text and push name
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_chat_jid FOREIGN KEY (chat_jid) REFERENCES chats (jid) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sender_jid FOREIGN KEY (sender_jid) REFERENCES users (jid) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uc_chat_message UNIQUE (chat_jid, whatsapp_message_id)
);

-- Table for Media Attachments (Files)
-- A single message can have multiple attachments
CREATE TABLE media_attachments (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL, -- Foreign key to the messages table
    file_path TEXT NOT NULL, -- Local path to the file
    mime_type TEXT,
    file_name TEXT,
    sha256_hash TEXT,
    media_key_data BYTEA, -- Raw bytes of the mediaKey for decryption
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_message_id FOREIGN KEY (message_id) REFERENCES messages (id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Indexes for Messages table (crucial for performance)
CREATE INDEX idx_messages_chat_jid ON messages (chat_jid);
CREATE INDEX idx_messages_sender_jid ON messages (sender_jid);
CREATE INDEX idx_messages_timestamp ON messages (timestamp DESC); -- For retrieving latest messages quickly
CREATE INDEX idx_messages_whatsapp_id ON messages (whatsapp_message_id); -- Useful for direct lookups by WhatsApp ID
CREATE INDEX idx_messages_search_vector ON messages USING GIN (search_vector);

-- Index for media_attachments to quickly find all media for a message
CREATE INDEX idx_media_attachments_message_id ON media_attachments (message_id);

-- Unique constraint for media_attachments to prevent duplicate files per message
CREATE UNIQUE INDEX uc_media_attachments_message_file ON media_attachments (message_id, file_path);
