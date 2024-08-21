import { getCurrencyFromBidderRequest } from '../libraries/ortb2Utils/currency.js';
import { ortbConverter } from '../libraries/ortbConverter/converter.js';
import { Renderer } from '../src/Renderer.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, NATIVE, VIDEO } from '../src/mediaTypes.js';
import { toLegacyResponse } from '../src/native.js';
import { deepAccess, deepSetValue, isFn, isPlainObject, logError, logWarn } from '../src/utils.js';
import { INSTREAM, OUTSTREAM } from '../src/video.js';

const BIDDER_CODE = 'smilewanted';
const SMILEWANTED_ENDPOINT = 'https://prebid.smilewanted.com';
const SMILEWANTED_CSYNC_URL = 'https://csync.smilewanted.com';
const GVL_ID = 639;
const CURRENCY = 'EUR';
const TTL = 300;

/**
 * @typedef {import('../src/adapters/bidderFactory.js').BidRequest} BidRequest
 * @typedef {import('../src/adapters/bidderFactory.js').Bid} Bid
 * @typedef {import('../src/adapters/bidderFactory.js').BidderRequest} BidderRequest
 * @typedef {import('../src/adapters/bidderFactory.js').ServerResponse} ServerResponse
 * @typedef {import('../src/adapters/bidderFactory.js').SyncOptions} SyncOptions
 * @typedef {import('../src/adapters/bidderFactory.js').UserSync} UserSync
 */

export const spec = {
  code: BIDDER_CODE,
  gvlid: GVL_ID,
  aliases: ['smile', 'sw'],
  supportedMediaTypes: [BANNER, VIDEO, NATIVE],
  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {BidRequest} bid The bid to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function (bid) {
    if (!bid.params || !bid.params.zoneId) {
      return false;
    }

    if (deepAccess(bid, 'mediaTypes.video')) {
      const videoMediaTypesParams = deepAccess(bid, 'mediaTypes.video', {});
      const videoBidderParams = deepAccess(bid, 'params.video', {});

      const videoParams = {
        ...videoMediaTypesParams,
        ...videoBidderParams,
      };

      if (!videoParams.context || ![INSTREAM, OUTSTREAM].includes(videoParams.context)) {
        return false;
      }
    }

    return true;
  },

  buildRequests(bidRequests, bidderRequest) {
    let requests = [];

    const videoBids = bidRequests.filter(bid => deepAccess(bid, 'mediaTypes.video'));
    videoBids.forEach(bid => {
      requests.push(createRequest([bid], bidderRequest, VIDEO));
    });

    const nativeBids = bidRequests.filter(bid => deepAccess(bid, 'mediaTypes.native'));
    nativeBids.forEach(bid => {
      requests.push(createRequest([bid], bidderRequest, NATIVE));
    });

    const bannerBids = bidRequests.filter(bid => !deepAccess(bid, 'mediaTypes.video') && !deepAccess(bid, 'mediaTypes.native'));
    bannerBids.forEach(bid => {
      requests.push(createRequest([bid], bidderRequest, BANNER));
    });

    return requests;
  },
  /**
   * Unpack the response from the server into a list of bids.
   *
   * @param {ServerResponse} serverResponse A successful response from the server.
   * @param {BidRequest} bidRequest
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretResponse: function (serverResponse, bidRequest) {
    if (!serverResponse || !serverResponse.body) {
      return [];
    }

    try {
      const result = CONVERTER.fromORTB({request: bidRequest.data, response: serverResponse.body});
      return result.bids;
    } catch (error) {
      logError('Error while parsing smilewanted response', error);
      return [];
    }
  },
  /**
   * Register the user sync pixels which should be dropped after the auction.
   *
   * @param {SyncOptions} syncOptions Which user syncs are allowed?
   * @param {ServerResponse[]} responses List of server's responses.
   * @param {Object} gdprConsent The GDPR consent parameters
   * @param {Object} uspConsent The USP consent parameters
   * @param {Object} gppConsent The GPP consent parameters
   * @return {UserSync[]} The user syncs which should be dropped.
   */
  getUserSyncs: function (syncOptions, responses, gdprConsent, uspConsent, gppConsent) {
    const syncs = [];

    if (syncOptions.iframeEnabled) {
      let params = [];

      // GDPR
      if (gdprConsent && typeof gdprConsent.consentString === 'string') {
        // add 'gdpr' only if 'gdprApplies' is defined
        if (typeof gdprConsent.gdprApplies === 'boolean') {
          params.push(`gdpr=${Number(gdprConsent.gdprApplies)}&gdpr_consent=${gdprConsent.consentString}`);
        } else {
          params.push(`gdpr_consent=${gdprConsent.consentString}`);
        }
      }

      // US Privacy
      if (uspConsent) {
        params.push(`us_privacy=${encodeURIComponent(uspConsent)}`);
      }

      // GPP
      if (gppConsent?.gppString && gppConsent?.applicableSections?.length) {
        params.push(`gpp=${encodeURIComponent(gppConsent.gppString)}`);
        params.push(`gpp_sid=${encodeURIComponent(gppConsent.applicableSections.join(','))}`);
      }

      const paramsStr = params.length > 0 ? '?' + params.join('&') : '';

      syncs.push({
        type: 'iframe',
        url: SMILEWANTED_CSYNC_URL + paramsStr,
      });
    }

    return syncs;
  },
};

/**
 * Create SmileWanted renderer
 * @param bidRequest
 * @param bidResponse
 * @returns {*}
 */
function newRenderer(bidRequest, bidResponse) {
  const renderer = Renderer.install({
    id: bidRequest.bidId,
    url: bidResponse.OustreamTemplateUrl,
    loaded: false,
  });

  try {
    renderer.setRender(outstreamRender);
  } catch (err) {
    logWarn('Prebid Error calling setRender on newRenderer', err);
  }
  return renderer;
}

/**
 * Initialise SmileWanted outstream
 * @param bid
 */
function outstreamRender(bid) {
  bid.renderer.push(() => {
    window.SmileWantedOutStreamInit({
      width: bid.width,
      height: bid.height,
      vastUrl: bid.vastUrl,
      elId: bid.adUnitCode,
    });
  });
}

export const CONVERTER = ortbConverter({
  context: {
    netRevenue: true,
    ttl: TTL,
    currency: CURRENCY,
  },
  imp(buildImp, bidRequest, context) {
    const imp = buildImp(bidRequest, context);
    imp.bidfloorcur = context.currencyCode;

    const bidfloor = deepAccess(bidRequest, 'params.bidfloor') || getBidFloor(bidRequest, context.mediaType);
    if (bidfloor > 0) {
      imp.bidfloor = bidfloor;
    }

    imp.ext.bidder = { zoneId: deepAccess(bidRequest, 'params.zoneId') };
    if (deepAccess(bidRequest, 'adUnitCode')) {
      imp.tagid = bidRequest.adUnitCode;
    }

    if (context.mediaType === BANNER && bidRequest.mediaTypes?.banner === undefined && bidRequest.sizes) {
      imp.banner = {
        format: bidRequest.sizes.map((size) => ({ w: size[0], h: size[1] })),
      };
    }

    if (context.mediaType === VIDEO) {
      const videoContext = deepAccess(bidRequest, 'mediaTypes.video.context');
      if (videoContext) {
        deepSetValue(imp, 'video.ext.context', videoContext);
      }
    }

    return imp;
  },
  request(buildRequest, imps, bidderRequest, context) {
    const request = buildRequest(imps, bidderRequest, context);
    const bidRequest = context.bidRequests[0];

    // PrebidJs Version and timeout
    request.ext = { prebidVersion: '$prebid.version$' };
    if (deepAccess(bidRequest, 'timeout')) {
      deepSetValue(request, 'tmax', bidRequest.timeout);
    }

    // PositionType
    if (deepAccess(bidRequest, 'params.positionType')) {
      deepSetValue(request, 'ext.positionType', deepAccess(bidRequest, 'params.positionType'));
    }

    // External Ids
    if (deepAccess(bidRequest, 'userIdAsEids')) {
      deepSetValue(request, 'user.eids', bidRequest.userIdAsEids);
    }

    // get the referer via refererInfo.page
    if (!deepAccess(bidderRequest, 'ortb2.site.page') && deepAccess(bidderRequest, 'refererInfo.page')) {
      deepSetValue(request, 'site.page', deepAccess(bidderRequest, 'refererInfo.page'));
    }

    // GDPR
    if (deepAccess(bidderRequest, 'gdprConsent')) {
      const consentString = deepAccess(bidderRequest, 'gdprConsent.consentString');
      if (consentString) {
        deepSetValue(request, 'user.consent', consentString);
      }

      const gdprApplies = deepAccess(bidderRequest, 'gdprConsent.gdprApplies');
      if (gdprApplies) {
        deepSetValue(request, 'regs.gdpr', gdprApplies);
      }
    }

    // Us Privacy
    if (deepAccess(bidderRequest, 'uspConsent')) {
      deepSetValue(request, 'regs.us_privacy', deepAccess(bidderRequest, 'uspConsent'));
    }

    // GPP
    if (deepAccess(bidderRequest, 'gppConsent')) {
      const gpp = deepAccess(bidderRequest, 'gppConsent.gppString');
      if (gpp) {
        deepSetValue(request, 'regs.gpp', gpp);
      }

      const gppSid = deepAccess(bidderRequest, 'gppConsent.applicableSections');
      if (gppSid) {
        deepSetValue(request, 'regs.gpp_sid', gppSid);
      }
    }

    return request;
  },
  bidResponse(buildBidResponse, bid, context) {
    const { bidRequest } = context;

    let mediaType;
    if (deepAccess(bidRequest, 'mediaTypes.video')) {
      mediaType = 'video';
    } else if (deepAccess(bidRequest, 'mediaTypes.native')) {
      mediaType = 'native';
    } else {
      mediaType = 'banner';
    }

    // Handle native response before building final response
    let nativeResult = null;
    if (mediaType === 'native') {
      try {
        if (!bid.adm) {
          throw new Error('No adm field in native bid response');
        }

        let nativeResponse;
        try {
          nativeResponse = JSON.parse(bid.adm);
        } catch (parseError) {
          throw new Error(`Failed to parse native response: ${parseError.message}`);
        }

        if (!nativeResponse || !nativeResponse.native) {
          throw new Error('Invalid native response structure');
        }

        const ortbRequest = bidRequest.nativeOrtbRequest;
        nativeResult = toLegacyResponse(nativeResponse.native, ortbRequest);
      } catch (error) {
        logError('Error while processing native response', error);
      }
    }

    const bidResponse = buildBidResponse(bid, context);

    if (mediaType) {
      bidResponse.mediaType = mediaType;
    }

    // Handle video responses
    if (mediaType === 'video') {
      bidResponse.vastUrl = bid.adm;
      delete bidResponse.ad;

      // Add the renderer for outstream
      const videoContext = deepAccess(bidRequest, 'mediaTypes.video.context');
      if (videoContext === 'outstream') {
        bidResponse.renderer = newRenderer(bidRequest, {
          OustreamTemplateUrl: 'https://prebid.smilewanted.com/scripts_outstream/infeed.js'
        });
      }
    }

    // Add native if exists
    if (mediaType === 'native' && nativeResult) {
      bidResponse.native = nativeResult;
    }

    return bidResponse;
  },
  response(buildResponse, bidResponses, bidderRequest, context) {
    return buildResponse(bidResponses, bidderRequest, context);
  },
});

/**
 * Get the floor price from bid.params for backward compatibility.
 * If not found, then check floor module.
 * @param bid A valid bid object
 * @param mediaType string
 * @returns {*|number} floor price
 */
function getBidFloor(bid, mediaType) {
  if (isFn(bid.getFloor)) {
    const floorInfo = bid.getFloor({
      currency: CURRENCY,
      mediaType: mediaType || BANNER,
      size: bid.sizes.map((size) => ({ w: size[0], h: size[1] })),
    });
    if (isPlainObject(floorInfo) && !isNaN(floorInfo.floor) && floorInfo.currency === CURRENCY) {
      return parseFloat(floorInfo.floor);
    }
  }
  return null;
}

function createRequest(bidRequests, bidderRequest, mediaType) {
  const context = {
    mediaType: mediaType,
    currencyCode: getCurrencyFromBidderRequest(bidderRequest) || CURRENCY,
  };

  const data = CONVERTER.toORTB({
    bidRequests,
    bidderRequest,
    context,
  });

  const zoneId = data.imp[0].ext.bidder.zoneId;

  return {
    method: 'POST',
    url: SMILEWANTED_ENDPOINT + '/sz/' + zoneId,
    data: data,
  };
}

registerBidder(spec);
