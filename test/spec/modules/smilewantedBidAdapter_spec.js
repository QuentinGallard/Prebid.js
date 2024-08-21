import { expect } from 'chai';
import { spec } from 'modules/smilewantedBidAdapter.js';
import { config } from 'src/config.js';
import {hook} from '../../../src/hook';

describe('Smilewanted BidAdapter tests', function() {
  const DISPLAY_REQUEST = [{
    adUnitCode: 'sw_300x250',
    bidId: '12345',
    timeout: 1000,
    sizes: [
      [300, 250],
      [300, 200]
    ],
    bidder: 'smilewanted',
    params: {
      zoneId: 1
      // positionType: 'infeed',
      // bidfloor: 0.23
    },
    requestId: 'request_abcd1234',
    ortb2Imp: {
      ext: {
        tid: 'trans_abcd1234',
      }
    },
  }];

  const DISPLAY_REQUEST_WITH_EIDS = [{
    adUnitCode: 'sw_300x250',
    bidId: '12345',
    sizes: [
      [300, 250],
      [300, 200]
    ],
    bidder: 'smilewanted',
    params: {
      zoneId: 1
    },
    requestId: 'request_abcd1234',
    ortb2Imp: {
      ext: {
        tid: 'trans_abcd1234',
      }
    },
    userIdAsEids: [{
      source: 'pubcid.org',
      uids: [{
        id: 'some-random-id-value',
        atype: 1
      }]
    }, {
      source: 'adserver.org',
      uids: [{
        id: 'some-random-id-value',
        atype: 1,
        ext: {
          rtiPartner: 'TDID'
        }
      }]
    }]
  }];

  const DISPLAY_REQUEST_WITH_POSITION_TYPE = [{
    adUnitCode: 'sw_300x250',
    bidId: '12345',
    sizes: [
      [300, 250],
      [300, 200]
    ],
    bidder: 'smilewanted',
    params: {
      zoneId: 1,
      positionType: 'infeed'
    },
    requestId: 'request_abcd1234',
    ortb2Imp: {
      ext: {
        tid: 'trans_abcd1234',
      }
    },
  }];

  const DISPLAY_REQUEST_WITH_SCHAIN = [{
    adUnitCode: 'sw_300x250',
    bidId: '12345',
    sizes: [
      [300, 250],
      [300, 200]
    ],
    bidder: 'smilewanted',
    params: {
      zoneId: 1,
    },
    requestId: 'request_abcd1234',
    ortb2Imp: {
      ext: {
        tid: 'trans_abcd1234',
      }
    },
    schain: {
      'ver': '1.0',
      'complete': 1,
      'nodes': [
        {
          'asi': 'exchange1.com',
          'sid': '1234',
          'hp': 1,
          'rid': 'bid-request-1',
          'name': 'publisher',
          'domain': 'publisher.com'
        },
        {
          'asi': 'exchange2.com',
          'sid': 'abcd',
          'hp': 1,
          'rid': 'bid-request-2',
          'name': 'intermediary',
          'domain': 'intermediary.com'
        }
      ]
    },
  }];

  const VIDEO_INSTREAM_REQUEST = [{
    adUnitCode: 'sw_300x250',
    code: 'video1',
    mediaTypes: {
      video: {
        context: 'instream',
        mimes: ['video/mp4'],
        minduration: 0,
        maxduration: 120,
        protocols: [1, 2, 3, 4, 5, 6, 7, 8],
        startdelay: 0,
        placement: 1,
        skip: 1,
        skipafter: 10,
        minbitrate: 10,
        maxbitrate: 10,
        delivery: [1],
        playbackmethod: [2],
        api: [1, 2],
        linearity: 1,
        playerSize: [640, 480]
      }
    },
    sizes: [
      [640, 480]
    ],
    bidder: 'smilewanted',
    params: {
      zoneId: 2,
      bidfloor: 2.50
    },
    requestId: 'request_abcd1234',
    ortb2Imp: {
      ext: {
        tid: 'trans_abcd1234',
      }
    }
  }];

  const NATIVE_REQUEST = [{
    adUnitCode: 'native_300x250',
    code: '/19968336/prebid_native_example_1',
    bidId: '12345',
    sizes: [
      [300, 250]
    ],
    mediaTypes: {
      native: {
        sendTargetingKeys: false,
        title: {
          required: true,
          len: 140
        },
        image: {
          required: true,
          sizes: [300, 250]
        },
        icon: {
          required: false,
          sizes: [50, 50]
        },
        sponsoredBy: {
          required: true
        },
        body: {
          required: true
        },
        clickUrl: {
          required: false
        },
        privacyLink: {
          required: false
        },
        cta: {
          required: false
        },
        rating: {
          required: false
        },
        likes: {
          required: false
        },
        downloads: {
          required: false
        },
        price: {
          required: false
        },
        salePrice: {
          required: false
        },
        phone: {
          required: false
        },
        address: {
          required: false
        },
        desc2: {
          required: false
        },
        displayUrl: {
          required: false
        }
      }
    },
    bidder: 'smilewanted',
    params: {
      zoneId: 4,
    },
    requestId: 'request_abcd1234',
    ortb2Imp: {
      ext: {
        tid: 'trans_abcd1234',
      }
    },
  }];

  // Default params with optional ones
  describe('smilewantedBidAdapterTests', function () {
    let page, bidderRequest;
    before(() => {
      // ortbConverter depends on other modules to be setup to work as expected so run hook.ready to register some
      // submodules so functions like setOrtbSourceExtSchain and setOrtbUserExtEids are available
      hook.ready();

      config.setConfig({
        'currency': {
          'adServerCurrency': 'EUR'
        }
      });

      page = 'http://test.com';
      // ortbConverter uses the site/device information from the ortb2 object passed in the bidderRequest object
      bidderRequest = {
        refererInfo: {
          page: page
        },
        ortb2: {
          source: {
            tid: 'tid000'
          },
          site: {
            mobile: 0,
            page: page,
          },
          device: {
            w: screen.width,
            h: screen.height,
            dnt: 0,
            ua: navigator.userAgent
          }
        },
        gdprConsent: {
          consentString: 'BOO_ch7OO_ch7AKABBENA2-AAAAZ97_______9______9uz_Gv_r_f__33e8_39v_h_7_u___m_-zzV4-_lvQV1yPA1OrfArgFA',
          gdprApplies: true
        }
      };
    });

    describe('SmileWanted - Verify build request', function () {
      it('SmileWanted - Verify Display request', function () {
        let requestOrtbDisplay, requestDisplayOrtbContent;

        // Here you can switch between different types of request

        // Display Request
        // requestOrtbDisplay = spec.buildOrtbRequests(DISPLAY_REQUEST, bidderRequest);

        // Video Instream Request
        // requestOrtbDisplay = spec.buildOrtbRequests(VIDEO_INSTREAM_REQUEST, bidderRequest);

        // Native Request
        requestOrtbDisplay = spec.buildOrtbRequests(NATIVE_REQUEST, bidderRequest);

        requestDisplayOrtbContent = requestOrtbDisplay[0].data;

        // OpenRTB
        // You can visualise the generated request in the error
        expect(requestOrtbDisplay).to.equal('');

      });
    });
  });
});
