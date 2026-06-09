import { NextRequest, NextResponse } from "next/server";
import { indexDriveFolder } from "@/lib/cloud/googleDrive";
import { indexTeraboxLibrary, getAdminTeraboxCredentials } from "@/lib/cloud/terabox";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let driveCount = 0;
    let teraboxCount = 0;

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (folderId) {
      driveCount = await indexDriveFolder(folderId);
    }

    const creds = getAdminTeraboxCredentials();
    if (creds) {
      teraboxCount = await indexTeraboxLibrary(creds);
    }

    return NextResponse.json({
      ok: true,
      indexed: { drive: driveCount, terabox: teraboxCount },
      at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron index failed" },
      { status: 500 }
    );
  }
}
