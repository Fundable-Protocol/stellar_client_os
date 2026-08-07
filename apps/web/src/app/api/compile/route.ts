import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceCode } = body;

    if (!sourceCode) {
      return NextResponse.json(
        { error: "Source code is required" },
        { status: 400 }
      );
    }

    // Create a temporary directory for the cargo project
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "soroban-build-"));
    const srcDir = path.join(tmpDir, "src");

    await fs.mkdir(srcDir, { recursive: true });

    // Write the Cargo.toml
    const cargoToml = `[package]
name = "soroban_contract"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "20.0"

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
`;

    await fs.writeFile(path.join(tmpDir, "Cargo.toml"), cargoToml);
    await fs.writeFile(path.join(srcDir, "lib.rs"), sourceCode);

    // Run cargo build
    return new Promise<NextResponse>((resolve) => {
      exec(
        `rustup target add wasm32-unknown-unknown && cargo build --target wasm32-unknown-unknown --release`,
        { cwd: tmpDir },
        async (error, stdout, stderr) => {
          if (error) {
            console.error("Compilation error:", stderr);
            resolve(
              NextResponse.json(
                { error: "Compilation failed", details: stderr },
                { status: 400 }
              )
            );
            return;
          }

          try {
            // Read the generated wasm file
            const wasmPath = path.join(
              tmpDir,
              "target",
              "wasm32-unknown-unknown",
              "release",
              "soroban_contract.wasm"
            );
            const wasmBuffer = await fs.readFile(wasmPath);
            const wasmBase64 = wasmBuffer.toString("base64");

            // Clean up the temporary directory in the background (fire and forget)
            fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);

            resolve(NextResponse.json({ wasmBase64 }));
          } catch (readError) {
            console.error("Failed to read wasm file:", readError);
            resolve(
              NextResponse.json(
                { error: "Failed to read compiled WebAssembly" },
                { status: 500 }
              )
            );
          }
        }
      );
    });
  } catch (error: unknown) {
    console.error("Compile endpoint error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
