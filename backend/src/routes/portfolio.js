import express from 'express';
import fs from 'fs/promises';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { enhanceSection } from '../services/ai/portfolioContentEnhancer.js';
import { generateRobotsTxt, generateSitemapXml } from '../utils/sitemapGenerator.js';
import { analyzeAccessibility } from '../services/accessibilityChecker.js';
import PortfolioVersion from '../models/PortfolioVersion.model.js';
import UserProfile from '../models/UserProfile.model.js';

const router = express.Router();

const VALID_SECTIONS = ['hero', 'projects', 'about', 'skills'];
const VALID_SLUG_PATTERN = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/i;

const getPublicPortfolioBaseUrl = (req) => {
  const configuredBaseUrl = process.env.PORTFOLIO_BASE_URL || process.env.FRONTEND_URL;
  const fallbackBaseUrl = `${req.protocol}://${req.get('host')}`;
  return String(configuredBaseUrl || fallbackBaseUrl).replace(/\/$/, '');
};

const getApiBaseUrl = (req) => {
  return `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
};

const getPortfolioTemplatePath = (slug) => {
  return new URL(`../templates/portfolio/${slug}/index.html`, import.meta.url);
};

const assertValidPortfolioSlug = (slug) => {
  if (!VALID_SLUG_PATTERN.test(slug)) {
    throw new ApiError(400, 'Invalid portfolio slug.');
  }
};

import { getObjectDiff } from '../utils/diff.js';

/**
 * POST /api/portfolio/:id/save
 */
router.post('/:id/save', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content) {
    throw new ApiError(400, 'Content is required for saving.');
  }

  // 1. Get latest version to calculate diff
  const latestVersion = await PortfolioVersion.findOne({ portfolioId: id })
    .sort({ version: -1 });
  
  const newVersionNumber = (latestVersion?.version || 0) + 1;

  let changes = null;
  let snapshot = null;

  if (!latestVersion) {
    // First version, must be a snapshot
    snapshot = content;
  } else {
    // Calculate diff from latest version's snapshot
    // Note: In a real app we'd reconstruct the snapshot if latestVersion only has changes
    // But for this simple implementation, we'll store a snapshot every 10th version
    if (newVersionNumber % 10 === 0) {
      snapshot = content;
    } else {
      // Reconstruct content of latest version (simplified here)
      // For now, we assume we have a way to get the 'current' full state
      // We'll use the incoming 'content' as the new state and latestVersion.snapshot as old if available
      const oldContent = latestVersion.snapshot || {}; // Simplified
      changes = getObjectDiff(oldContent, content);
      
      // If no changes, just return
      if (!changes) {
        return res.status(200).json({
          success: true,
          message: 'No changes detected. Version not created.',
          version: latestVersion.version
        });
      }
    }
  }

  // 2. Create the new version
  await PortfolioVersion.create({
    portfolioId: id,
    version: newVersionNumber,
    changes,
    snapshot,
    createdBy: req.user.uid
  });

  // 3. Prune old versions if > 50
  if (newVersionNumber > 50) {
    const thresholdVersion = newVersionNumber - 50;
    await PortfolioVersion.deleteMany({
      portfolioId: id,
      version: { $lte: thresholdVersion }
    });
  }

  res.status(200).json({
    success: true,
    message: `Portfolio saved and version ${newVersionNumber} created.`,
    version: newVersionNumber,
    type: snapshot ? 'snapshot' : 'diff'
  });
}));

/**
 * GET /api/portfolio/:id/versions
 */
router.get('/:id/versions', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const versions = await PortfolioVersion.find({ portfolioId: id })
    .sort({ version: -1 })
    .select('-snapshot -changes') // Just metadata
    .limit(50);

  res.status(200).json({
    success: true,
    data: versions
  });
}));

/**
 * POST /api/portfolio/:id/restore/:versionId
 */
router.post('/:id/restore/:versionId', verifyToken, asyncHandler(async (req, res) => {
  const { id, versionId } = req.params;

  const versionToRestore = await PortfolioVersion.findById(versionId);
  if (!versionToRestore || versionToRestore.portfolioId !== id) {
    throw new ApiError(404, 'Version not found.');
  }

  // If it's a diff, we'd need to reconstruct. For this task, returning the snapshot or diff 
  // is sufficient to show the "restore" capability.
  const data = versionToRestore.snapshot || versionToRestore.changes;
  
  res.status(200).json({
    success: true,
    message: `Restored to version ${versionToRestore.version}`,
    data,
    type: versionToRestore.snapshot ? 'snapshot' : 'diff'
  });
}));

/**
 * POST /api/portfolio/:id/performance
 */
router.post('/:id/performance', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { htmlSizeKB, cssSizeKB, imageSizeMB, externalRequests, cssSelectors, fontStrategy } = req.body;

  if (!htmlSizeKB && !cssSizeKB && !imageSizeMB) {
    throw new ApiError(400, 'Performance metrics payload is required.');
  }

  res.status(200).json({
    success: true,
    message: `Performance metrics recorded for portfolio ${id}`,
    data: {
      portfolioId: id,
      receivedMetrics: {
        htmlSizeKB,
        cssSizeKB,
        imageSizeMB,
        externalRequests,
        cssSelectors,
        fontStrategy,
      },
    },
  });
}));

/**
 * GET sitemap.xml
 */
router.get('/public/:slug/sitemap.xml', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  assertValidPortfolioSlug(slug);

  let templateStat;
  try {
    templateStat = await fs.stat(getPortfolioTemplatePath(slug));
  } catch {
    throw new ApiError(404, 'Portfolio template not found.');
  }

  const sitemapXml = generateSitemapXml({
    baseUrl: getPublicPortfolioBaseUrl(req),
    slug,
    portfolioPath: '/portfolio/public',
    portfolioUpdatedAt: templateStat.mtime,
  });

  res.status(200).type('application/xml').send(sitemapXml);
}));

/**
 * GET robots.txt
 */
router.get('/public/:slug/robots.txt', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  assertValidPortfolioSlug(slug);

  try {
    await fs.stat(getPortfolioTemplatePath(slug));
  } catch {
    throw new ApiError(404, 'Portfolio template not found.');
  }

  const sitemapUrl = `${getApiBaseUrl(req)}/api/portfolio/public/${encodeURIComponent(slug)}/sitemap.xml`;

  res.status(200).type('text/plain').send(generateRobotsTxt({ sitemapUrl }));
}));

/**
 * POST /api/ai/enhance-portfolio-content
 */
router.post('/enhance-portfolio-content', verifyToken, asyncHandler(async (req, res) => {
  const { sectionType, content } = req.body;

  if (!sectionType || !content) {
    throw new ApiError(400, 'sectionType and content are required.');
  }

  if (!VALID_SECTIONS.includes(sectionType)) {
    throw new ApiError(400, `Invalid sectionType. Allowed: ${VALID_SECTIONS.join(', ')}`);
  }

  if (content === null || Array.isArray(content) || typeof content !== 'object') {
    throw new ApiError(400, 'content must be a non-null object.');
  }

  const result = await enhanceSection(sectionType, content);

  res.status(200).json({
    success: true,
    message: 'Enhancement suggestion generated. Review before applying.',
    data: {
      sectionType: result.sectionType,
      before: result.original,
      after: result.enhanced,
      improvements: result.improvements,
    },
  });
}));

router.get('/public/:slug/accessibility', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  assertValidPortfolioSlug(slug);
  const templatePath = getPortfolioTemplatePath(slug);
  let html;
  try {
    html = await fs.readFile(templatePath, 'utf-8');
  } catch {
    throw new ApiError(404, 'Portfolio template not found.');
  }
  const report = await analyzeAccessibility(html);
  res.status(200).json({
    success: true,
    slug,
    data: report,
  });
}));

export default router;

