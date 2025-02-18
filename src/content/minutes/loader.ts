import type { Loader } from "astro/loaders";
import { getPDFsInFolder, type PDF } from "./gdrive.ts";

export function createLoader(
	name: string,
	driveID: string,
	path: string,
	preprocess?: (data: PDF) => Promise<PDF | null>): Loader
{
	return {
		name,
		async load({
			meta,
			store,
			parseData,
			logger })
		{
			const pageToken = meta.get("pageToken");
			let { foundChanges, newPageToken, pdfs } =
				await getPDFsInFolder(driveID, path, pageToken);

			if (typeof preprocess === "function") {
				// this may throw and stop the build, but it's not really clear how
				// errors should be handled here, so leave it for now
				pdfs = (await Promise.all(pdfs.map(preprocess)))
					.filter(Boolean) as PDF[];
			}

			// store the new page token in the build cache so that the next time the
			// content collection loader is called, we can use the token to check if
			// anything actually changed
			meta.set("pageToken", newPageToken);

			if (foundChanges) {
				// clear the store if there are any changes, since getPDFsInFolder()
				// returns all the PDFs currently in the folder, and it's easier to
				// just replace everything in order to handle deletions
				store.clear();
				logger.info(`Changes found, ${pdfs.length} PDFs`);

				for (const pdf of pdfs) {
					const { id } = pdf;
					// parseData() uses the schema defined in the collection to validate
					// the data
					const data = await parseData({ id, data: pdf });

					store.set({ id, data });
				}
			}
		}
	};
}
