const fs = require('fs');

const XML_PATH = 'temp_ecfr.xml';
const CSV_PATH = 'public/data/master_list.csv';
const OUTPUT_PATH = 'public/data/ratings.json';

// 1. Parse CSV to get the "Systems" and "Master List"
const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
const lines = csvContent.split(/\r?\n/).filter(x => x.trim().length > 0);
const headers = lines.shift();

const codeMap = new Map(); // Code -> { system, subSystem, link, condition }
const ranges = [];

lines.forEach(line => {
    const parts = parseCsvLine(line);
    if (parts.length < 4) return;

    const codeCol = parts[0];
    const condition = parts[1];
    const link = parts[3];

    if (codeCol.includes('-')) {
        const [start, end] = codeCol.split('-').map(Number);
        ranges.push({ start, end, system: condition, link });
    } else {
        const code = codeCol.trim();
        codeMap.set(code, { condition, link });
    }
});

function getSystem(codeStr) {
    const code = parseInt(codeStr, 10);
    if (isNaN(code)) return "Other";
    const range = ranges.find(r => code >= r.start && code <= r.end);
    return range ? range.system : "Other";
}

// 2. Parse XML
const xmlContent = fs.readFileSync(XML_PATH, 'utf-8');

const part4Regex = /<DIV5[^>]*N="4"[^>]*>([\s\S]*?)<\/DIV5>/i;
const match = part4Regex.exec(xmlContent);

if (!match) {
    console.error("Could not find PART 4 in XML");
    process.exit(1);
}

const part4Content = match[1];

let generalFormulas = {};

function parseTableBlock(content, titleParams) {
    const index = content.indexOf(titleParams);
    if (index === -1) return null;

    // Find the next <TABLE>
    const tableStart = content.indexOf("<TABLE", index);
    const tableEnd = content.indexOf("</TABLE>", tableStart);
    if (tableStart === -1 || tableEnd === -1) return null;

    const tableContent = content.substring(tableStart, tableEnd);
    const criteria = [];
    const rowRgx = /<TR>([\s\S]*?)<\/TR>/gi;
    let rMatch;
    while ((rMatch = rowRgx.exec(tableContent)) !== null) {
        const cells = parseCells(rMatch[1]);
        if (cells.length >= 2 && isRating(cells[cells.length - 1])) {
            criteria.push({
                percent: parseRating(cells[cells.length - 1]),
                description: cells[0]
            });
        }
    }
    return criteria;
}

generalFormulas["Mental Disorders"] = parseTableBlock(part4Content, "General Rating Formula for Mental Disorders");
generalFormulas["Heart"] = parseTableBlock(part4Content, "General Rating Formula for Diseases of the Heart");
generalFormulas["Skin"] = parseTableBlock(part4Content, "General Rating Formula for the Skin");

// Parse Inline Ratings
const rowRegex = /<TR>([\s\S]*?)<\/TR>/gi;
let currentRow;
const ratings = [];
let currentCodeObj = null;

while ((currentRow = rowRegex.exec(part4Content)) !== null) {
    const rowContent = currentRow[1];
    const cells = parseCells(rowContent);

    if (cells.length === 0) continue;

    const firstCell = cells[0];
    const lastCell = cells[cells.length - 1];

    const codeMatch = /^(\d{4})[\s.:]/.exec(firstCell);

    if (codeMatch) {
        if (currentCodeObj) ratings.push(currentCodeObj);

        const code = codeMatch[1];
        let condition = firstCell.replace(code, '').replace(/^[:\s.-]+/, '').trim();
        const csvEntry = codeMap.get(code);
        let rawSystem = getSystem(code);
        let link = csvEntry ? csvEntry.link : "";
        if (!link && rawSystem !== "Other") {
            const range = ranges.find(r => r.system === rawSystem);
            if (range) link = range.link;
        }

        let cleanSys = cleanSystemName(rawSystem);
        let subSys = assignSubSystem(condition, cleanSys);
        let finalSys = mapToLaymanSystem(cleanSys, subSys);

        currentCodeObj = {
            code: code,
            condition: condition,
            system: finalSys,
            subSystem: subSys,
            link: link || "https://www.ecfr.gov/current/title-38/part-4",
            criteria: []
        };

        if (isRating(lastCell)) {
            currentCodeObj.criteria.push({ percent: parseRating(lastCell), description: condition });
        }
    } else if (currentCodeObj) {
        if (isRating(lastCell)) {
            let desc = firstCell.replace(/^[:\s-]+/, '');
            currentCodeObj.criteria.push({ percent: parseRating(lastCell), description: desc });
        } else if (firstCell.startsWith("Note")) {
            currentCodeObj.notes = (currentCodeObj.notes ? currentCodeObj.notes + "\n" : "") + firstCell;
        }
    }
}
if (currentCodeObj) ratings.push(currentCodeObj);

// Post-Process: Fill in missing codes from CSV using General Formulas
const usedCodes = new Set(ratings.map(r => r.code));

codeMap.forEach((val, code) => {
    if (usedCodes.has(code)) return;

    let rawSystem = getSystem(code);
    let criteria = [];

    // Determine criteria based on system/range
    if (rawSystem.includes("Mental") || (parseInt(code) >= 9200 && parseInt(code) <= 9599)) {
        criteria = generalFormulas["Mental Disorders"];
        rawSystem = "Mental Health";
    } else if (rawSystem.includes("Cardio") || (parseInt(code) >= 7000 && parseInt(code) <= 7199)) {
        if (generalFormulas["Heart"]) criteria = generalFormulas["Heart"];
    } else if (rawSystem.includes("Skin") || (parseInt(code) >= 7800 && parseInt(code) <= 7833)) {
        if (generalFormulas["Skin"]) criteria = generalFormulas["Skin"];
    }

    if (criteria && criteria.length > 0) {
        let cleanSys = cleanSystemName(rawSystem);
        let subSys = assignSubSystem(val.condition, cleanSys);
        let finalSys = mapToLaymanSystem(cleanSys, subSys); // Map manual ones too!

        ratings.push({
            code: code,
            condition: val.condition,
            system: finalSys,
            subSystem: subSys,
            link: val.link,
            criteria: criteria,
            notes: "Rated using General Rating Formula."
        });
    }
});

const cleanedRatings = ratings.filter(r => r.criteria && r.criteria.length > 0 && r.system !== "Other");

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cleanedRatings, null, 2));
console.log(`Exported ${cleanedRatings.length} ratings to ${OUTPUT_PATH}`);

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            inQuote = !inQuote;
        } else if (c === ',' && !inQuote) {
            result.push(current);
            current = '';
        } else {
            current += c;
        }
    }
    result.push(current);
    return result.map(s => s.trim().replace(/^"|"$/g, ''));
}

function isRating(str) {
    return /^[\d]{1,3}$/.test(str);
}

function parseRating(str) {
    return parseInt(str, 10);
}

function cleanSystemName(sys) {
    const lower = sys.toLowerCase();
    if (lower.includes("musculoskeletal")) return "Musculoskeletal System";
    if (lower.includes("eye")) return "Eyes";
    if (lower.includes("ear")) return "Ears";
    if (lower.includes("mental")) return "Mental Health";
    if (lower.includes("cardiovascular")) return "Cardiovascular";
    if (lower.includes("respiratory")) return "Respiratory";
    if (lower.includes("digestive")) return "Digestive";
    if (lower.includes("genitourinary")) return "Genitourinary";
    if (lower.includes("gynecological")) return "Gynecological";
    if (lower.includes("hemic")) return "Hemic & Lymphatic";
    if (lower.includes("skin")) return "Skin";
    if (lower.includes("endocrine")) return "Endocrine";
    if (lower.includes("neurological")) return "Neurological";
    if (lower.includes("dental")) return "Dental";
    return sys;
}

function assignSubSystem(condition, system) {
    const lower = condition.toLowerCase();

    // Specific Anatomical Parts
    if (lower.includes("knee") || lower.includes("meniscus") || lower.includes("tibia") || lower.includes("fibula") || lower.includes("leg")) return "Knee & Lower Leg";
    if (lower.includes("hip") || lower.includes("femur") || lower.includes("thigh")) return "Hip & Thigh";
    if (lower.includes("spine") || lower.includes("vertebra") || lower.includes("back") || lower.includes("neck") || lower.includes("cervical") || lower.includes("lumbar")) return "Spine & Torso";
    if (lower.includes("shoulder") || lower.includes("arm") || lower.includes("clavicle") || lower.includes("scapula") || lower.includes("humerus")) return "Shoulder & Upper Arm";
    if (lower.includes("elbow") || lower.includes("forearm") || lower.includes("radius") || lower.includes("ulna")) return "Elbow & Forearm";
    if (lower.includes("wrist") || lower.includes("carpal")) return "Wrist";
    if (lower.includes("hand") || lower.includes("finger") || lower.includes("thumb")) return "Hand & Fingers";
    if (lower.includes("foot") || lower.includes("ankle") || lower.includes("toe") || lower.includes("tarsal") || lower.includes("metatarsal")) return "Foot & Ankle";
    if (lower.includes("headache") || lower.includes("migraine")) return "Headaches";
    if (lower.includes("sinus") || lower.includes("nose") || lower.includes("nasal")) return "Sinus & Nose";
    if (lower.includes("scar")) return "Scars";
    if (lower.includes("muscle")) return "Muscles";

    // Condition based
    if (lower.includes("arthritis")) return "Joints";

    return "General";
}

function mapToLaymanSystem(techSystem, subSystem) {
    // Override System based on Anatomical Part (SubSystem)
    if (subSystem === "Knee & Lower Leg" || subSystem === "Hip & Thigh" || subSystem === "Foot & Ankle") {
        return "Lower Body";
    }
    if (subSystem === "Shoulder & Upper Arm" || subSystem === "Elbow & Forearm" || subSystem === "Wrist" || subSystem === "Hand & Fingers") {
        return "Upper Body";
    }
    if (subSystem === "Spine & Torso" || subSystem === "Muscles") {
        return "Torso & Spine";
    }
    if (subSystem === "Headaches" || subSystem === "Sinus & Nose") {
        return "Head & Neck";
    }
    if (techSystem === "Eyes") return "Head & Neck";
    if (techSystem === "Ears") return "Head & Neck";
    if (techSystem === "Dental") return "Head & Neck";

    return techSystem; // Keep others like "Mental Health", "Cardiovascular"
}

function parseCells(rowContent) {
    const cells = [];
    const cellRegex = /<(?:TD|TH)[^>]*>([\s\S]*?)<\/(?:TD|TH)>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        let text = cellMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        cells.push(text);
    }
    return cells;
}
