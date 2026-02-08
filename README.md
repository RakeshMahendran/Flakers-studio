# FlakersStudio

**Governance-first AI assistant platform for enterprises**

FlakersStudio is a hosted enterprise platform that enables organizations to create governed, production-ready AI chatbots from their website or WordPress content. This is NOT a WordPress plugin or generic chatbot builder - it's a governance-first AI system designed for reliability, safety, and explainability.

## 🎯 Core Principles

### 1. Backend Authority
- All knowledge access, governance, and decision-making is enforced server-side
- The frontend never decides whether an answer is allowed

### 2. UI as a Reflection of Decisions
- The frontend renders different UI states based on structured backend decisions
- AI output is never shown without context, sources, and applied rules

### 3. Grounded AI Only
- All responses must be derived strictly from ingested enterprise content
- If no trusted source exists, the system must refuse to answer

### 4. Governance is Visible and Inspectable
- Users must be able to understand why an answer was given or refused
- Applied rules and sources are first-class outputs

## 🏗️ Architecture

### Frontend (Next.js + Tambo)
- **Next.js** with App Router
- **Tailwind CSS** for styling
- **Tambo AI** for UI orchestration and governance-driven components
- Responsible for authentication, assistant creation, and chat interface
- Never performs retrieval, embedding, or AI calls directly

### Backend (FastAPI + Python)
- **FastAPI** for high-performance API
- **PostgreSQL** for structured data
- **Qdrant** vector database for semantic search
- **Azure OpenAI** for LLM and embeddings
- Enforces all governance rules and decisions

### Key Components

#### Governance Engine (`app/services/governance.py`)
The heart of the system that makes all AI decisions:
- Evaluates every query against governance rules
- Returns structured decisions (ANSWER/REFUSE)
- Ensures backend authority over all responses

#### Tambo Components
- **AnswerCard**: Displays approved responses with sources
- **RefusalCard**: Shows governance refusals with explanations
- **GovernancePanel**: Transparent view of applied rules

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+
- PostgreSQL
- Qdrant vector database
- Azure OpenAI account

### Backend Setup

1. **Install dependencies**:
   ```bash
   cd server
   pip install -r requirements.txt
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start services**:
   ```bash
   # Start PostgreSQL and Qdrant
   # Then start the API
   python main.py
   ```

### Frontend Setup

1. **Install dependencies**:
   ```bash
   cd client
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Access the application**:
   Open [http://localhost:3000](http://localhost:3000)

## 🔐 Governance Rules

FlakersStudio enforces these mandatory governance rules:

1. **Require Context**: No response without relevant content from knowledge base
2. **Tenant Isolation**: Prevents cross-tenant data access
3. **Intent Filtering**: Only allows content matching assistant's scope
4. **Attribution Required**: All responses must cite sources
5. **Policy Quote Only**: Legal/policy content must be quoted directly
6. **Confidence Threshold**: Requires high confidence in retrieved content

## 📊 User Experience Flow

1. **Login** → User authenticates
2. **Source Selection** → Choose Website or WordPress
3. **Template Selection** → Pick assistant type (Support, Sales, etc.)
4. **Content Discovery** → System crawls and classifies content
5. **Governance Configuration** → Rules applied based on template
6. **Assistant Deployment** → Ready for production use
7. **Governed Chat** → All responses pass through governance checks
8. **Transparency** → Users can inspect sources and applied rules

## 🎨 Tambo Integration

FlakersStudio uses Tambo AI for governance-driven UI:

- **Dynamic Component Selection**: Backend decisions determine which UI components render
- **Structured Responses**: All AI outputs are wrapped in governance context
- **Explainable UI**: Every decision is transparent and inspectable

### Example Tambo Flow
```typescript
// Backend returns structured decision
{
  "decision": "ANSWER",
  "answer": "...",
  "sources": [...],
  "rules_applied": [...]
}

// Frontend renders appropriate Tambo component
<AnswerCard 
  answer={response.answer}
  sources={response.sources}
  rulesApplied={response.rules_applied}
/>
```

## 🔧 Development

### Key Files

**Backend**:
- `server/app/services/governance.py` - Core governance engine
- `server/app/api/routes/chat.py` - Critical chat endpoint
- `server/app/models/` - Database models
- `server/app/core/qdrant_client.py` - Vector database client

**Frontend**:
- `client/src/components/flakers-studio/app.tsx` - Main application
- `client/src/components/flakers-studio/tambo-components/` - Governance UI components
- `client/src/components/flakers-studio/screens/` - Application screens

### Testing

```bash
# Backend tests
cd server
pytest

# Frontend tests  
cd client
npm test
```

## 📈 Production Deployment

FlakersStudio is designed for enterprise production use:

- **Scalable**: Horizontal scaling with load balancers
- **Secure**: End-to-end governance and tenant isolation
- **Auditable**: Full logging of all decisions and sources
- **Reliable**: Fail-safe governance prevents hallucinations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Ensure all governance principles are maintained
4. Submit a pull request

## 📄 License

Copyright © 2024 FlakersStudio. All rights reserved.

---

**FlakersStudio**: Where governance meets AI. Built for enterprises that demand reliability, safety, and explainability in their AI systems.