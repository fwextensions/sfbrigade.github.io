import { google, type drive_v3 } from "googleapis";

export type PDF = {
	id: string;
	name: string;
	createdTime: string;
	url: string;
};

// strip this unnecessary param from the viewLinks
const USPPattern = /\?usp=\w+$/;

// this key should be a JSON string created from a service-account.json file
const credentials = JSON.parse(import.meta.env.DRIVE_KEYS_JSON ?? "");
const scopes = ["https://www.googleapis.com/auth/drive.readonly"];

const auth = new google.auth.GoogleAuth({	credentials, scopes });
const drive = google.drive({ version: "v3", auth });

async function getFolderID(
	driveID: string,
	folderPath: string)
{
	const folders = folderPath.split("/").filter(Boolean);
	// we have to start at the shared drive root
	let folderID = driveID;

	for (const folderName of folders) {
		const res = await drive.files.list({
			q: `name='${folderName}' and '${folderID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			fields: "files(id, name)",
			spaces: "drive",
			includeItemsFromAllDrives: true,
			supportsAllDrives: true,
		});
		const folder = res.data.files?.[0];

		if (!folder) {
			throw new Error(`Folder '${folderName}' not found.`);
		}

		folderID = folder.id ?? "";
	}

	return folderID;
}

async function getStartPageToken(
	driveID: string)
{
	const res = await drive.changes.getStartPageToken({
		driveId: driveID,
		supportsAllDrives: true,
	});

	return res.data.startPageToken ?? "";
}

async function getChangedPDFsInFolder(
	driveID: string,
	folderID: string,
	pageToken: string)
{
	const { data: { changes = [], newStartPageToken }} = await drive.changes.list({
		pageToken: pageToken,
		driveId: driveID,
		supportsAllDrives: true,
		includeItemsFromAllDrives: true,
		fields: "newStartPageToken, changes(file(id, name, webViewLink, createdTime, mimeType, parents))",
	});
	// the change items have the file data on a subkey, unlike files.list(), so
	// extract that from each item.  we also have to tell TS it's not undefined,
	// even though we filter out any nullish values below.
	const pdfs = changes.map(({ file }) => file!)
		.filter(Boolean)
		.filter((file) => file.mimeType === "application/pdf"
			&& file.parents?.includes(folderID));

	return {
		pdfs,
		newPageToken: newStartPageToken ?? "",
	};
}

export async function getPDFsInFolder(
	driveID: string,
	folderPath: string,
	pageToken: string = "")
{
	// if there's no pageToken, we're starting from scratch, so assume there are changes
	let foundChanges = !pageToken;
	let newPageToken = "";
	let pdfs: drive_v3.Schema$File[] = [];

	try {
		const folderID = await getFolderID(driveID, folderPath);

		if (pageToken) {
			// the caller already has a pageToken from a previous call, so check if
			// any PDFs have changed since then
			const res = await getChangedPDFsInFolder(driveID, folderID, pageToken);

			foundChanges = !!res.pdfs.length;
			newPageToken = res.newPageToken;
		}

		if (foundChanges){
			const res = await drive.files.list({
				q: `'${folderID}' in parents and mimeType='application/pdf' and trashed=false`,
				fields: "files(id, name, webViewLink, createdTime)",
				spaces: "drive",
				includeItemsFromAllDrives: true,
				supportsAllDrives: true,
			});

			pdfs = res.data.files ?? [];
			foundChanges = true;
			newPageToken ??= await getStartPageToken(driveID);
		}
	} catch (error) {
		console.error("Error:", error);
	}

	// add a url key without the usp param from webViewLink
	pdfs = pdfs.map(({ webViewLink, ...rest }) => ({
		...rest,
		url: webViewLink?.replace(USPPattern, "") ?? "",
	}));

	return {
		foundChanges,
		newPageToken,
		// despite setting up all the keys, we still have to cast this so TS doesn't
		// complain about accessing them in the loader
		pdfs: pdfs as PDF[],
	};
}
