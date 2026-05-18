import { NextRequest, NextResponse } from "next/server";
import { stat } from "fs/promises";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

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
        
        let statInfo;
        try {
            statInfo = await stat(filePath);
        } catch {
            return new NextResponse("File not found", { status: 404 });
        }

        const ext = path.extname(filename).toLowerCase();
        let mimeType = basicMimeMap[ext];
        
        if (!mimeType) {
            mimeType = "application/octet-stream";
        }

        const fileSize = statInfo.size;
        const range = request.headers.get("range");

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            
            const fileStream = fs.createReadStream(filePath, { start, end });
            // Converte o Node Stream para Web ReadableStream (compatível com o NextResponse do Next.js)
            const webStream = Readable.toWeb(fileStream) as any;

            return new NextResponse(webStream, {
                status: 206,
                headers: {
                    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunksize.toString(),
                    "Content-Type": mimeType,
                    "Cache-Control": "public, max-age=86400"
                }
            });
        } else {
            const fileStream = fs.createReadStream(filePath);
            const webStream = Readable.toWeb(fileStream) as any;

            return new NextResponse(webStream, {
                status: 200,
                headers: {
                    "Content-Length": fileSize.toString(),
                    "Content-Type": mimeType,
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "public, max-age=86400"
                }
            });
        }

    } catch (error) {
        console.error("Error serving media:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
