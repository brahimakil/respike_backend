# Respike Backend API

A modular, scalable NestJS backend with Firebase integration and database abstraction layer.

## 🏗️ Architecture

The backend is built with a **flexible database abstraction layer** that allows switching between different databases (Firebase, MongoDB, etc.) by simply changing the `.env` configuration.

### Folder Structure

```
src/
├── auth/                    # Authentication module
│   ├── decorators/         # Custom decorators (CurrentUser, etc.)
│   ├── dto/                # Data Transfer Objects
│   ├── guards/             # Auth guards for protected routes
│   ├── interfaces/         # TypeScript interfaces
│   ├── auth.controller.ts  # Auth endpoints
│   ├── auth.service.ts     # Auth business logic
│   └── auth.module.ts      # Auth module configuration
│
├── config/                 # Configuration files
│   └── env.config.ts      # Environment variable configuration
│
├── database/              # Database abstraction layer
│   ├── firebase/         # Firebase implementation
│   │   ├── firebase.config.ts
│   │   ├── firebase-database.service.ts
│   │   └── firebase-query.builder.ts
│   ├── database.interface.ts  # Database service interface
│   └── database.module.ts     # Database module configuration
│
├── app.module.ts          # Main application module
└── main.ts               # Application entry point
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase project (or MongoDB if switching)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:

**Option A: Using Service Account File (Recommended)**

- Download your Firebase service account JSON from Firebase Console
- Save it as `firebase-service-account.json` in the root directory
- See `FIREBASE_SETUP.md` for detailed instructions

**Option B: Using Environment Variables**

- Copy `env.example` to `.env`
- Fill in your Firebase credentials

3. Start the development server:
```bash
npm run start:dev
```

The server will start on `http://localhost:3000`

## 📝 Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database Type (firebase | mongodb)
DATABASE_TYPE=firebase

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-service-account-email

# CORS
CORS_ORIGIN=http://localhost:5173
```

## 🔐 Authentication Endpoints

### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "displayName": "John Doe"
}
```

### Validate Token
```http
POST /auth/validate
Authorization: Bearer <firebase-id-token>
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer <firebase-id-token>
```

## 🔄 Switching Databases

To switch from Firebase to MongoDB (or another database):

1. Change `DATABASE_TYPE` in `.env`:
```env
DATABASE_TYPE=mongodb
MONGODB_URI=mongodb://localhost:27017/respike
```

2. Implement the `DatabaseService` interface for your database in `src/database/[your-db]/`

3. Update the factory in `database.module.ts`

**No other code changes required!** The abstraction layer handles everything.

## 🛠️ Available Scripts

```bash
# Development
npm run start:dev          # Start with hot-reload
npm run start:debug        # Start in debug mode

# Production
npm run build             # Build for production
npm run start:prod        # Run production build

# Testing
npm run test              # Run unit tests
npm run test:e2e          # Run e2e tests
npm run test:cov          # Test coverage

# Code Quality
npm run lint              # Run ESLint
npm run format            # Format with Prettier
```

## 📦 Dependencies

### Core
- **NestJS** - Progressive Node.js framework
- **Firebase Admin SDK** - Firebase backend integration
- **@nestjs/config** - Configuration management

### Validation
- **class-validator** - Decorator-based validation
- **class-transformer** - Object transformation

## 🏛️ Design Patterns

### Database Abstraction
The `DatabaseService` interface provides a unified API for all database operations:

```typescript
interface DatabaseService {
  create<T>(collection: string, data: Partial<T>): Promise<T>;
  findOne<T>(collection: string, id: string): Promise<T | null>;
  findMany<T>(collection: string, query?, options?): Promise<T[]>;
  update<T>(collection: string, id: string, data: Partial<T>): Promise<T>;
  delete(collection: string, id: string): Promise<void>;
  query<T>(collection: string): QueryBuilder<T>;
}
```

### Dependency Injection
All modules use NestJS's powerful DI system for loose coupling and testability.

### Guards & Decorators
Protected routes use `@UseGuards(AuthGuard)` and access current user with `@CurrentUser()`.

## 📄 File Size Guidelines

- **Maximum 800 lines per file**
- Files exceeding this limit are split into logical modules
- Each module is self-contained and focused on a single responsibility

## 🔒 Security

- Firebase Admin SDK for secure authentication
- JWT token validation on protected routes
- Input validation using class-validator
- CORS configuration
- Environment variable protection

## 🤝 Contributing

1. Keep files under 800 lines
2. Follow the existing folder structure
3. Use TypeScript strictly
4. Add proper error handling
5. Write tests for new features

## 📚 Learn More

- [NestJS Documentation](https://docs.nestjs.com/)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [TypeScript Documentation](https://www.typescriptlang.org/)
