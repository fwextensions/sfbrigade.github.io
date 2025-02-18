import { defineCollection, z } from "astro:content";
import { createLoader } from "./loader.ts";
import type { PDF } from "./gdrive";

const QuarterPattern = /^(\d{4})[- _]+Q(\d)/;

const driveID = import.meta.env.BOARD_MINUTES_DRIVE_ID ?? "";
// the path should be from the root of the shared drive to the folder containing
// the PDFs of the minutes
const minutesPath = import.meta.env.BOARD_MINUTES_DRIVE_PATH ?? "";

async function preprocess(
	pdf: PDF)
{
		const { name } = pdf;
		const result = name?.match(QuarterPattern);
		const year = parseInt(result?.[1] ?? "");
		const quarter = parseInt(result?.[2] ?? "");

		if (isNaN(year) || isNaN(quarter)) {
			return null;
		}

		return {
			...pdf,
			year,
			quarter,
		};
}

export const minutes = defineCollection({
	loader: createLoader("minutes", driveID, minutesPath, preprocess),
	schema: z.object({
		id: z.string(),
		name: z.string(),
		createdTime: z.string(),
		url: z.string(),
		year: z.number(),
		quarter: z.number(),
	})
});
