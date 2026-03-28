import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import mime from "mime"; // Note: next.js might not have mime installed natively, but let's see. If not, I'll use a basic map.

const basicMimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm"
};

export async function GET(request: NextRequest, context: { params: Promise<{ filename: string }> }) {
    try {
        const { filename } = await context.params;
        if (!filename || filename.includes("..")) {
            return new NextResponse("Invalid request", { status: 400 });
        }

        const filePath = path.join(process.cwd(), "public", "uploads", "evidences", filename);
        
        try {
            await stat(filePath); // Check if exists
        } catch {
            return new NextResponse("File not found", { status: 404 });
        }

        const buffer = await readFile(filePath);
        
        const ext = path.extname(filename).toLowerCase();
        let mimeType = basicMimeMap[ext];
        
        if (!mimeType) {
            try {
               const mimeLib = await import("mime");
               mimeType = mimeLib.default.getType(ext) || "application/octet-stream";
            } catch {
               mimeType = "application/octet-stream";
            }
        }

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": mimeType,
                "Content-Length": buffer.length.toString(),
                "Cache-Control": "public, max-age=86400"
            }
        });

    } catch (error) {
        console.error("Error serving media:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
