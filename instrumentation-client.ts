/**
 * Runs before the app becomes interactive — suppress benign Monaco/LSP noise
 * before Next.js devtools registers its error overlay handlers.
 */
import { installBenignErrorFilters } from "@/lib/editor/benign-errors";

installBenignErrorFilters();
