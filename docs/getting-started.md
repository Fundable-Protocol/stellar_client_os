# Local Development Setup

This document outlines the steps required to set up your local development environment for the `stellar_client` project, which includes a Next.js frontend, Soroban smart contracts, and a TypeScript SDK.

## Prerequisites

Before you begin, ensure you have the following installed:

-   **Node.js**: Version 18 or higher.
    -   `node -v`
-   **pnpm**: Version 8 or higher. This project uses `pnpm` exclusively for package management.
    -   `pnpm -v`
    -   If not installed, install with: `npm install -g pnpm`
    -   **Do not use `npm install` or `yarn`** — doing so will create a `package-lock.json` or `yarn.lock` that conflicts with the monorepo setup and will fail CI.
-   **Rust**: For compiling the Soroban smart contracts.
    -   Install `rustup` by following instructions on [rustup.rs](https://rustup.rs/).
    -   `rustc --version`
-   **Soroban CLI**: Essential for interacting with Soroban smart contracts (e.g., building, testing, deploying).
    -   Follow the installation guide on the official Soroban documentation: [Soroban CLI Setup](https://soroban.stellar.org/docs/getting-started/setup)
    -   `soroban version`

## Getting Started

Follow these steps to get the project up and running on your local machine.

### 1. Clone the Repository

First, clone the `stellar_client` repository to your local machine:

```bash
git clone git@github.com:Fundable-Protocol/stellar_client.git
cd stellar_client
```

### 2. Install Dependencies

Navigate to the project root and install the necessary dependencies for all workspaces using `pnpm`:

```bash
pnpm install
```

### 3. Build Contracts

The Soroban smart contracts need to be built. Navigate to the `contracts` directory and build them:

```bash
cd contracts
cargo build --release
# Optionally, go back to the root
cd ..
```

Alternatively, you can run the `build:contracts` script from the project root after `pnpm install`:

```bash
pnpm build:contracts
```

## Development Commands

Once setup is complete, you can use the following commands for development:

### Web Application

To start the Next.js frontend application in development mode:

```bash
pnpm dev
```

This will typically start the application on `http://localhost:3000`.

### Smart Contracts

-   **Build Contracts pnpm**:
    ```bash
    pnpm build:contracts
    ```
-   **Build Contracts cargo**:
    ```bash
    cd contracts
    cargo build --release
    ```

-   **Run Contract Tests pnpm**:
    ```bash
    pnpm test:contracts
    ```
-   **Run Contract Tests cargo**:
    ```bash
    cd contracts
    cargo test
    ```

## Project Structure Overview

The project is structured as a monorepo containing:

-   `apps/web`: The Next.js frontend application.
-   `contracts/`: Soroban smart contracts written in Rust.
    -   `payment-stream/`: Contract for payment streaming.
    -   `distributor/`: Contract for token distribution.
-   `packages/sdk`: A TypeScript SDK for interacting with the deployed contracts.