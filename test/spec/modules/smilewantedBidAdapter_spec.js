import { expect } from 'chai';
import { CONVERTER, spec } from 'modules/smilewantedBidAdapter.js';
import { config } from 'src/config.js';
import {deepClone} from 'src/utils';

// load modules that register ORTB processors
import 'src/prebid.js';
import 'modules/consentManagementTcf.js';
import 'modules/schain.js';
import {decorateAdUnitsWithNativeParams} from '../../../src/native.js';
import {hook} from '../../../src/hook';

describe('Smile Wanted Adapter tests', function() {
  const DISPLAY_REQUEST = [{
    adUnitCode: 'sw_300x250',
    bidder: 'smilewanted',
    bidId: '12345',
    timeout: 1000,
    sizes: [[300, 250], [300, 200]],
    mediaTypes: {
      banner: {
        sizes: [[300, 250], [300, 200]]
      }
    },
    params: {
      zoneId: 1
    },
    requestId: 'request_abcd1234',
    ortb2Imp: {
      ext: {
        tid: 'trans_abcd1234',
      }
    },
  }];

  const DISPLAY_REQUEST_WITH_EIDS = deepClone(DISPLAY_REQUEST);
  DISPLAY_REQUEST_WITH_EIDS[0].userIdAsEids = [
    {
      source: 'pubcid.org',
      uids: [{
        id: 'some-random-id-value-1',
        atype: 1
      }]
    },
    {
      source: 'adserver.org',
      uids: [{
        id: 'some-random-id-value-2',
        atype: 1,
        ext: {
          rtiPartner: 'TDID'
        }
      }]
    }
  ];

  const DISPLAY_REQUEST_WITH_POSITION_TYPE = deepClone(DISPLAY_REQUEST);
  DISPLAY_REQUEST_WITH_POSITION_TYPE[0].params.positionType = 'infeed';

  const DISPLAY_REQUEST_WITH_SCHAIN = deepClone(DISPLAY_REQUEST);
  DISPLAY_REQUEST_WITH_SCHAIN[0].schain = {
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
  };

  const INVALID_VIDEO_INSTREAM_REQUEST = deepClone(DISPLAY_REQUEST);
  INVALID_VIDEO_INSTREAM_REQUEST[0].adUnitCode = 'sw_invalid_video_640x480';
  INVALID_VIDEO_INSTREAM_REQUEST[0].sizes = [[640, 480]];
  INVALID_VIDEO_INSTREAM_REQUEST[0].params = {
    zoneId: 2,
    bidfloor: 2.5
  };
  INVALID_VIDEO_INSTREAM_REQUEST[0].mediaTypes = {
    video: {}
  };

  const VIDEO_INSTREAM_REQUEST = deepClone(DISPLAY_REQUEST);
  VIDEO_INSTREAM_REQUEST[0].adUnitCode = 'sw_instream_video_640x480';
  VIDEO_INSTREAM_REQUEST[0].sizes = [[640, 480]];
  VIDEO_INSTREAM_REQUEST[0].params = {
    zoneId: 2,
    bidfloor: 2.5
  };
  VIDEO_INSTREAM_REQUEST[0].mediaTypes = {
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
  };

  const VIDEO_OUTSTREAM_REQUEST = deepClone(DISPLAY_REQUEST);
  VIDEO_OUTSTREAM_REQUEST[0].adUnitCode = 'sw_outstream_video_640x480';
  VIDEO_OUTSTREAM_REQUEST[0].sizes = [[640, 480]];
  VIDEO_OUTSTREAM_REQUEST[0].mediaTypes = {
    video: {
      context: 'outstream',
      placement: 3,
      playerSize: [640, 480]
    }
  };
  VIDEO_OUTSTREAM_REQUEST[0].params = {
    zoneId: 3,
    bidfloor: 2.5
  };

  const NATIVE_REQUEST = deepClone(DISPLAY_REQUEST);
  NATIVE_REQUEST[0].adUnitCode = 'sw_native_300x250';
  NATIVE_REQUEST[0].sizes = [[300, 250]];
  NATIVE_REQUEST[0].params = {zoneId: 4};
  NATIVE_REQUEST[0].mediaTypes = {
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
  };

  // Responses ORTB

  const BID_RESPONSE_ORTB_DISPLAY = {
    'body': {
      'id': 'b0d257b7-4a4e-4bf4-af33-6ac6e17f618a',
      'bidid': '123',
      'cur': 'EUR',
      'seatbid': [
        {
          'bid': [
            {
              'id': 'd7ab25ca-f837-49ee-883b-f98c27840e4f',
              'impid': '12345',
              'price': 15,
              'adid': '123',
              'adm': '< --- sw script --- >',
              'adomain': ['test838.com'],
              'cid': '123',
              'crid': 'crid4',
              'h': 250,
              'w': 300
            }
          ],
          'seat': '123'
        }
      ]
    }
  };

  const BID_RESPONSE_ORTB_VIDEO_INSTREAM = {
    'id': '0d9dfaf1-6864-46d8-ba98-b1adf3ef6449',
    'seatbid': [
      {
        'bid': [
          {
            'id': '6ce957fb-357b-4fb3-9209-f872799fa58a',
            'impid': '12345',
            'price': 10,
            'adid': '123',
            'adm': '< --- sw script --- >',
            'adomain': [
              'test454.com'
            ],
            'cid': '123',
            'crid': 'crid3',
            'h': 480,
            'w': 640,
            'ext': {
              'smilewanted': {
                'formatTypeSw': 'video_instream'
              }
            }
          }
        ],
        'seat': '123'
      }
    ],
    'bidid': '123',
    'cur': 'EUR'
  };

  const BID_RESPONSE_ORTB_VIDEO_OUTSTREAM = {
    'id': '4e4ddcf9-8679-4e93-88da-6eca40ade1e0',
    'seatbid': [
      {
        'bid': [
          {
            'id': 'b7fd41e3-5ba7-4530-a6c5-683d5307021f',
            'impid': '12345',
            'price': 10,
            'adid': '123',
            'adm': '< --- sw script --- >',
            'adomain': [
              'test190.com'
            ],
            'cid': '123',
            'crid': 'crid1',
            'h': 480,
            'w': 640,
            'ext': {
              'smilewanted': {
                'formatTypeSw': 'video_outstream'
              }
            }
          }
        ],
        'seat': '123'
      }
    ],
    'bidid': '123',
    'cur': 'EUR'
  };

  const BID_RESPONSE_ORTB_NATIVE = {
    'id': '22314124-dc15-4757-9d35-e3099760501f',
    'seatbid': [
      {
        'bid': [
          {
            'id': '28e3f3fa-c9fe-4295-97f7-3a51a7ba4e81',
            'impid': '12345',
            'price': 10,
            'adid': '123',
            'adm': '< --- sw script --- >',
            'adomain': [
              'test914.com'
            ],
            'cid': '123',
            'crid': 'crid3',
            'h': 250,
            'w': 300,
            'ext': {
              'smilewanted': {
                'formatTypeSw': 'native'
              }
            }
          }
        ],
        'seat': '123'
      }
    ],
    'bidid': '123',
    'cur': 'EUR'
  };

  // Responses

  const BID_RESPONSE_DISPLAY = {
    body: {
      cpm: 3,
      width: 300,
      height: 250,
      creativeId: 'crea_sw_1',
      currency: 'EUR',
      isNetCpm: true,
      ttl: 300,
      ad: '< --- sw script --- >',
      cSyncUrl: 'https://csync.smilewanted.com'
    }
  };

  const BID_RESPONSE_VIDEO_INSTREAM = {
    body: {
      cpm: 3,
      width: 640,
      height: 480,
      creativeId: 'crea_sw_2',
      currency: 'EUR',
      isNetCpm: true,
      ttl: 300,
      ad: 'https://vast.smilewanted.com',
      cSyncUrl: 'https://csync.smilewanted.com',
      formatTypeSw: 'video_instream'
    }
  };

  const BID_RESPONSE_VIDEO_OUTSTREAM = {
    body: {
      cpm: 3,
      width: 640,
      height: 480,
      creativeId: 'crea_sw_3',
      currency: 'EUR',
      isNetCpm: true,
      ttl: 300,
      ad: 'https://vast.smilewanted.com',
      cSyncUrl: 'https://csync.smilewanted.com',
      OustreamTemplateUrl: 'https://prebid.smilewanted.com/scripts_outstream/infeed.js',
      formatTypeSw: 'video_outstream'
    }
  };

  const BID_RESPONSE_NATIVE = {
    body: {
      cpm: 3,
      width: 300,
      height: 250,
      creativeId: 'crea_sw_1',
      currency: 'EUR',
      isNetCpm: true,
      ttl: 300,
      ad: '{"link":{"url":"https://www.smilewanted.com"},"assets":[{"id":0,"required":1,"title":{"len":50}},{"id":1,"required":1,"img":{"type":3,"w":150,"h":50,"ext":{"aspectratios":["2:1"]}}},{"id":2,"required":0,"img":{"type":1,"w":50,"h":50,"ext":{"aspectratios":["2:1"]}}},{"id":3,"required":1,"data":{"type":1,"value":"Smilewanted sponsor"}},{"id":4,"required":1,"data":{"type":2,"value":"Smilewanted Description"}}]}',
      cSyncUrl: 'https://csync.smilewanted.com',
      formatTypeSw: 'native'
    }
  };

  function updateNativeParams(bidRequests) {
    bidRequests = deepClone(bidRequests);
    decorateAdUnitsWithNativeParams(bidRequests);
    return bidRequests;
  }

  // Default params with optional ones
  describe('smilewantedBidAdapterTests', function () {
    let bidderRequest;
    before(() => {
      hook.ready();

      config.setConfig({
        'currency': {
          'adServerCurrency': 'EUR'
        }
      });

      const page = 'http://test.com';
      bidderRequest = {
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
        }
      };
    });

    describe('Smile Wanted - check configuration', function() {
      it('Smile Wanted - Verify bidder code', function () {
        expect(spec.code).to.equal('smilewanted');
      });

      it('Smile Wanted - Verify bidder gvl id', function () {
        expect(spec.gvlid).to.equal(639);
      });

      it('Smile Wanted - Verify supported medias', function () {
        expect(spec.supportedMediaTypes).to.include('banner');
        expect(spec.supportedMediaTypes).to.include('video');
        expect(spec.supportedMediaTypes).to.include('native');
      });

      it('Smile Wanted - Verify bidder aliases', function () {
        expect(spec.aliases).to.have.lengthOf(2);
        expect(spec.aliases[0]).to.equal('smile');
        expect(spec.aliases[1]).to.equal('sw');
      });
    });

    describe('Smile Wanted - Verify if bid request is valid', function() {
      it('Smile Wanted - Verify if bid request valid', function () {
        expect(spec.isBidRequestValid(DISPLAY_REQUEST[0])).to.equal(true);
        expect(spec.isBidRequestValid({
          params: {
            zoneId: 1234
          }
        })).to.equal(true);
      });

      it('Smile Wanted - Verify if video bid request is valid', function() {
        expect(spec.isBidRequestValid(VIDEO_INSTREAM_REQUEST[0])).to.equal(true);
      });

      it('Smile Wanted - Verify if video bid request with missing parameters is invalid', function() {
        expect(spec.isBidRequestValid(INVALID_VIDEO_INSTREAM_REQUEST[0])).to.equal(false);
      });

      it('Smile Wanted - Verify if params(zoneId) is not passed', function () {
        expect(spec.isBidRequestValid({})).to.equal(false);
        expect(spec.isBidRequestValid({
          params: {}
        })).to.equal(false);
      });
    });

    describe('Smile Wanted - Verify build request', function () {
      afterEach(function () {
        config.resetConfig();
      });

      let requestOrtb, requestOrtbContent;
      it('Smile Wanted - Verify Display request', function () {
        requestOrtb = spec.buildOrtbRequests(DISPLAY_REQUEST, bidderRequest);
        requestOrtbContent = requestOrtb[0].data;

        it('Verify common elements in request ORTB', function() {
          expect(requestOrtb[0].method).to.equal('POST');
          expect(requestOrtb[0].url).to.equal('https://prebid.smilewanted.com');
        });

        // Object OpenRTB
        expect(requestOrtbContent).to.have.property('id').to.be.a('string');
        expect(requestOrtbContent).to.have.property('tmax', 1000);
        // imp
        expect(requestOrtbContent.imp).to.be.an('array').with.lengthOf(DISPLAY_REQUEST.length);
        expect(requestOrtbContent.imp[0].id).to.be.equal('12345');
        expect(requestOrtbContent.imp[0].tagid).to.be.equal('sw_300x250');
        expect(requestOrtbContent.imp[0].bidfloorcur).to.be.equal('EUR');
        // imp.banner
        expect(requestOrtbContent.imp[0].banner.format).to.be.an('array').with.lengthOf(2);
        expect(requestOrtbContent.imp[0].banner.format[0]).to.have.property('h', 250);
        expect(requestOrtbContent.imp[0].banner.format[0]).to.have.property('w', 300);
        expect(requestOrtbContent.imp[0].banner.format[1]).to.have.property('h', 200);
        expect(requestOrtbContent.imp[0].banner.format[1]).to.have.property('w', 300);
        // imp.video and imp.native
        expect(requestOrtbContent.imp[0]).to.not.have.property('video');
        expect(requestOrtbContent.imp[0]).to.not.have.property('native');
        // imp.ext
        expect(requestOrtbContent.imp[0].ext.bidder.zoneId).to.be.equal(1); // zoneId
        expect(requestOrtbContent.imp[0].ext.tid).to.be.equal('trans_abcd1234'); // transactionId

        // device
        expect(requestOrtbContent.device).to.have.property('w', screen.width);
        expect(requestOrtbContent.device).to.have.property('h', screen.height);
        expect(requestOrtbContent.device).to.have.property('dnt').that.is.oneOf([0, 1]);
        expect(requestOrtbContent.device).to.have.property('ua', navigator.userAgent);

        // source
        expect(requestOrtbContent.source.tid).to.be.equal('tid000');

        // site
        expect(requestOrtbContent.site.mobile).that.is.oneOf([0, 1]);
        expect(requestOrtbContent.site.page).to.be.equal('http://test.com');
        // user
        expect(requestOrtbContent).to.not.have.property('user');
        // ext
        expect(requestOrtbContent.ext).to.not.have.property('positionType');
        expect(requestOrtbContent.ext.prebidVersion).to.be.equal('$prebid.version$');
      });

      it('Smile Wanted - Verify build request with referer', function () {
        let bidderRequestWithReferer = deepClone(bidderRequest);

        const pageReferer = 'https://localhost/Prebid.js/integrationExamples/gpt/hello_world.html';
        bidderRequestWithReferer.refererInfo = {page : pageReferer};
        delete bidderRequestWithReferer.ortb2.site.page;

        requestOrtb = spec.buildOrtbRequests(DISPLAY_REQUEST, bidderRequestWithReferer);
        requestOrtbContent = requestOrtb[0].data;

        expect(requestOrtbContent.site.page).to.be.equal(pageReferer);
      });

      it('Smile Wanted - Verify Display request with eids', function () {
        requestOrtb = spec.buildOrtbRequests(DISPLAY_REQUEST_WITH_EIDS, bidderRequest);
        requestOrtbContent = requestOrtb[0].data;

        // user
        expect(requestOrtbContent.user.ext.eids).to.be.an('array').with.lengthOf(2);
        expect(requestOrtbContent.user.ext.eids[0].source).to.be.equal('pubcid.org');
        expect(requestOrtbContent.user.ext.eids[0].uids).to.be.an('array').with.lengthOf(1);
        expect(requestOrtbContent.user.ext.eids[0].uids[0].atype).to.be.equal(1);
        expect(requestOrtbContent.user.ext.eids[0].uids[0].id).to.be.equal('some-random-id-value-1');
        expect(requestOrtbContent.user.ext.eids[1].source).to.be.equal('adserver.org');
        expect(requestOrtbContent.user.ext.eids[1].uids).to.be.an('array').with.lengthOf(1);
        expect(requestOrtbContent.user.ext.eids[1].uids[0].atype).to.be.equal(1);
        expect(requestOrtbContent.user.ext.eids[1].uids[0].id).to.be.equal('some-random-id-value-2');
        expect(requestOrtbContent.user.ext.eids[1].uids[0].ext.rtiPartner).to.be.equal('TDID');
      });

      it('Smile Wanted - Verify Display request with schain', function () {
        requestOrtb = spec.buildOrtbRequests(DISPLAY_REQUEST_WITH_SCHAIN, bidderRequest);
        requestOrtbContent = requestOrtb[0].data;

        // source
        expect(requestOrtbContent.source.ext.schain.complete).to.be.equal(1);
        expect(requestOrtbContent.source.ext.schain.nodes).to.be.an('array').with.lengthOf(2);

        expect(requestOrtbContent.source.ext.schain.nodes[0].asi).to.be.equal('exchange1.com');
        expect(requestOrtbContent.source.ext.schain.nodes[0].domain).to.be.equal('publisher.com');
        expect(requestOrtbContent.source.ext.schain.nodes[0].hp).to.be.equal(1);
        expect(requestOrtbContent.source.ext.schain.nodes[0].name).to.be.equal('publisher');
        expect(requestOrtbContent.source.ext.schain.nodes[0].rid).to.be.equal('bid-request-1');
        expect(requestOrtbContent.source.ext.schain.nodes[0].sid).to.be.equal('1234');

        expect(requestOrtbContent.source.ext.schain.nodes[1].asi).to.be.equal('exchange2.com');
        expect(requestOrtbContent.source.ext.schain.nodes[1].domain).to.be.equal('intermediary.com');
        expect(requestOrtbContent.source.ext.schain.nodes[1].hp).to.be.equal(1);
        expect(requestOrtbContent.source.ext.schain.nodes[1].name).to.be.equal('intermediary');
        expect(requestOrtbContent.source.ext.schain.nodes[1].rid).to.be.equal('bid-request-2');
        expect(requestOrtbContent.source.ext.schain.nodes[1].sid).to.be.equal('abcd');
      });

      it('Smile Wanted - Verify Display request with position type', function () {
        requestOrtb = spec.buildOrtbRequests(DISPLAY_REQUEST_WITH_POSITION_TYPE, bidderRequest);
        requestOrtbContent = requestOrtb[0].data;

        expect(requestOrtbContent.ext).to.have.property('positionType').and.to.equal('infeed');
      });

      it('Smile Wanted - Verify Video Instream request', function () {
        requestOrtb = spec.buildOrtbRequests(VIDEO_INSTREAM_REQUEST, bidderRequest);
        requestOrtbContent = requestOrtb[0].data;

        expect(requestOrtbContent.imp[0]).to.not.have.property('banner');
        expect(requestOrtbContent.imp[0]).to.not.have.property('native');

        expect(requestOrtbContent.imp[0].bidfloor).to.be.equal(2.5);
        expect(requestOrtbContent.imp[0].tagid).to.be.equal('sw_instream_video_640x480');
        expect(requestOrtbContent.imp[0].video.ext.context).to.be.equal('instream');
        expect(requestOrtbContent.imp[0].video.mimes).to.be.an('array').that.include('video/mp4');
        expect(requestOrtbContent.imp[0].video.minduration).to.be.equal(0);
        expect(requestOrtbContent.imp[0].video.maxduration).to.be.equal(120);
        expect(requestOrtbContent.imp[0].video.protocols).to.be.an('array').that.include.members([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(requestOrtbContent.imp[0].video.startdelay).to.be.equal(0);
        expect(requestOrtbContent.imp[0].video.placement).to.be.equal(1);
        expect(requestOrtbContent.imp[0].video.skip).to.be.equal(1);
        expect(requestOrtbContent.imp[0].video.skipafter).to.be.equal(10);
        expect(requestOrtbContent.imp[0].video.minbitrate).to.be.equal(10);
        expect(requestOrtbContent.imp[0].video.maxbitrate).to.be.equal(10);
        expect(requestOrtbContent.imp[0].video.delivery).to.be.an('array').that.include(1);
        expect(requestOrtbContent.imp[0].video.playbackmethod).to.be.an('array').that.include(2);
        expect(requestOrtbContent.imp[0].video.api).to.be.an('array').that.include.members([1, 2]);
        expect(requestOrtbContent.imp[0].video.linearity).to.be.equal(1);
        expect(requestOrtbContent.imp[0].video.w).to.be.equal(640);
        expect(requestOrtbContent.imp[0].video.h).to.be.equal(480);
      });

      it('Smile Wanted - Verify Video Outstream request', function () {
        requestOrtb = spec.buildOrtbRequests(VIDEO_OUTSTREAM_REQUEST, bidderRequest);
        requestOrtbContent = requestOrtb[0].data;

        expect(requestOrtbContent.imp[0]).to.not.have.property('banner');
        expect(requestOrtbContent.imp[0]).to.not.have.property('native');

        expect(requestOrtbContent.imp[0].bidfloor).to.be.equal(2.5);
        expect(requestOrtbContent.imp[0].tagid).to.be.equal('sw_outstream_video_640x480');
        expect(requestOrtbContent.imp[0].ext.bidder.zoneId).to.be.equal(3);

        expect(requestOrtbContent.imp[0].video.ext.context).to.be.equal('outstream');
        expect(requestOrtbContent.imp[0].video.placement).to.be.equal(3);
        expect(requestOrtbContent.imp[0].video.w).to.be.equal(640);
        expect(requestOrtbContent.imp[0].video.h).to.be.equal(480);
      });

      it('Smile Wanted - Verify Native request', function () {
        requestOrtb = spec.buildOrtbRequests(updateNativeParams(NATIVE_REQUEST), bidderRequest);
        requestOrtbContent = requestOrtb[0].data;

        expect(requestOrtbContent.imp[0]).to.not.have.property('banner');
        expect(requestOrtbContent.imp[0]).to.not.have.property('video');

        expect(requestOrtbContent.imp[0].tagid).to.be.equal('sw_native_300x250');
        expect(requestOrtbContent.imp[0].ext.bidder.zoneId).to.be.equal(4);

        const expectedNativeContent = '{"ver":"1.2","assets":[{"id":0,"required":1,"title":{"len":140}},{"id":1,"required":1,"img":{"type":3,"w":300,"h":250}},{"id":2,"required":0,"img":{"type":1,"w":50,"h":50}},{"id":3,"required":1,"data":{"type":1}},{"id":4,"required":1,"data":{"type":2}},{"id":5,"required":0,"data":{"type":12}},{"id":6,"required":0,"data":{"type":3}},{"id":7,"required":0,"data":{"type":4}},{"id":8,"required":0,"data":{"type":5}},{"id":9,"required":0,"data":{"type":6}},{"id":10,"required":0,"data":{"type":7}},{"id":11,"required":0,"data":{"type":8}},{"id":12,"required":0,"data":{"type":9}},{"id":13,"required":0,"data":{"type":11}}],"privacy":1}';

        expect(requestOrtbContent.imp[0].native.request).to.be.equal(expectedNativeContent);
        expect(requestOrtbContent.imp[0].native.ver).to.be.equal('1.2');
      });
    });

    describe('gdpr tests', function () {
      afterEach(function () {
        config.resetConfig();
      });

      it('SmileWanted - Verify build request with GDPR', function () {
        config.setConfig({
          'currency': {
            'adServerCurrency': 'EUR'
          },
          consentManagement: {
            cmp: 'iab',
            consentRequired: true,
            timeout: 1000,
            allowAuctionWithoutConsent: true
          }
        });
        const bidderRequestGdpr = {
          gdprConsent: {
            consentString: 'BOO_ch7OO_ch7AKABBENA2-AAAAZ97_______9______9uz_Gv_r_f__33e8_39v_h_7_u___m_-zzV4-_lvQV1yPA1OrfArgFA',
            gdprApplies: true
          }
        };

        const requestOrtb = spec.buildOrtbRequests(DISPLAY_REQUEST, bidderRequestGdpr);
        const requestOrtbContent = requestOrtb[0].data;
        expect(requestOrtbContent.regs.ext.gdpr).to.be.equal(true);
        expect(requestOrtbContent.user.ext.consent).to.be.equal('BOO_ch7OO_ch7AKABBENA2-AAAAZ97_______9______9uz_Gv_r_f__33e8_39v_h_7_u___m_-zzV4-_lvQV1yPA1OrfArgFA');
      });

      it('SmileWanted - Verify build request with GDPR without gdprApplies', function () {
        config.setConfig({
          'currency': {
            'adServerCurrency': 'EUR'
          },
          consentManagement: {
            cmp: 'iab',
            consentRequired: true,
            timeout: 1000,
            allowAuctionWithoutConsent: true
          }
        });

        const bidderRequestGdpr = {
          gdprConsent: {
            consentString: 'BOO_ch7OO_ch7AKABBENA2-AAAAZ97_______9______9uz_Gv_r_f__33e8_39v_h_7_u___m_-zzV4-_lvQV1yPA1OrfArgFA'
          }
        };

        const requestOrtb = spec.buildOrtbRequests(DISPLAY_REQUEST, bidderRequestGdpr);
        const requestOrtbContent = requestOrtb[0].data;
        expect(requestOrtbContent).to.not.have.property('regs');
        expect(requestOrtbContent.user.ext.consent).to.be.equal('BOO_ch7OO_ch7AKABBENA2-AAAAZ97_______9______9uz_Gv_r_f__33e8_39v_h_7_u___m_-zzV4-_lvQV1yPA1OrfArgFA');
      });
    });

    describe('Smile Wanted - Verify OpenRTB parsed responses', function() {
      afterEach(function () {
        config.resetConfig();
      });

      it('Smile Wanted - Verify ORTB parsed response - Display', function() {
        const request = spec.buildOrtbRequests(DISPLAY_REQUEST, bidderRequest);
        const requestOrtb = {ortbRequest: request[0].data};

        const bids = spec.interpretOrtbResponse(BID_RESPONSE_DISPLAY, requestOrtb);

        // Here I get the following error :
        // Error: ortbRequest passed to `fromORTB` must be the same object returned by `toORTB`
        // => I need to find out how to build the request with the same object than the one I pass to the interpretOrtbResponse function

        // TODO : Assert Results
        expect(bids).to.be.equal('');

        // Data to check :
        // cpm
        // ad
        // width
        // height
        // creativeId
        // currency
        // netRevenue
        // ttl
        // requestId
      });
    });

    describe('Smile Wanted - Verify parse responses', function() {
      it('Smile Wanted - Verify parse response - Display', function () {
        const request = spec.buildRequests(DISPLAY_REQUEST);
        const bids = spec.interpretResponse(BID_RESPONSE_DISPLAY, request[0]);
        expect(bids).to.have.lengthOf(1);
        const bid = bids[0];
        expect(bid.cpm).to.equal(3);
        expect(bid.ad).to.equal('< --- sw script --- >');
        expect(bid.width).to.equal(300);
        expect(bid.height).to.equal(250);
        expect(bid.creativeId).to.equal('crea_sw_1');
        expect(bid.currency).to.equal('EUR');
        expect(bid.netRevenue).to.equal(true);
        expect(bid.ttl).to.equal(300);
        expect(bid.requestId).to.equal(DISPLAY_REQUEST[0].bidId);

        expect(function () {
          spec.interpretResponse(BID_RESPONSE_DISPLAY, {
            data: 'invalid Json'
          })
        }).to.not.throw();
      });

      it('Smile Wanted - Verify parse response - Video Instream', function () {
        const request = spec.buildRequests(VIDEO_INSTREAM_REQUEST);
        const bids = spec.interpretResponse(BID_RESPONSE_VIDEO_INSTREAM, request[0]);
        expect(bids).to.have.lengthOf(1);
        const bid = bids[0];
        expect(bid.cpm).to.equal(3);
        expect(bid.ad).to.equal(null);
        expect(bid.vastUrl).to.equal('https://vast.smilewanted.com');
        expect(bid.width).to.equal(640);
        expect(bid.height).to.equal(480);
        expect(bid.creativeId).to.equal('crea_sw_2');
        expect(bid.currency).to.equal('EUR');
        expect(bid.netRevenue).to.equal(true);
        expect(bid.ttl).to.equal(300);
        expect(bid.requestId).to.equal(VIDEO_INSTREAM_REQUEST[0].bidId);

        expect(function () {
          spec.interpretResponse(BID_RESPONSE_VIDEO_INSTREAM, {
            data: 'invalid Json'
          })
        }).to.not.throw();
      });

      it('Smile Wanted - Verify parse response - Video Outstream', function () {
        const request = spec.buildRequests(VIDEO_OUTSTREAM_REQUEST);
        const bids = spec.interpretResponse(BID_RESPONSE_VIDEO_OUTSTREAM, request[0]);
        expect(bids).to.have.lengthOf(1);
        const bid = bids[0];
        expect(bid.cpm).to.equal(3);
        expect(bid.vastUrl).to.equal('https://vast.smilewanted.com');
        expect(bid.renderer.url).to.equal('https://prebid.smilewanted.com/scripts_outstream/infeed.js');
        expect(bid.width).to.equal(640);
        expect(bid.height).to.equal(480);
        expect(bid.creativeId).to.equal('crea_sw_3');
        expect(bid.currency).to.equal('EUR');
        expect(bid.netRevenue).to.equal(true);
        expect(bid.ttl).to.equal(300);
        expect(bid.requestId).to.equal(VIDEO_OUTSTREAM_REQUEST[0].bidId);

        expect(function () {
          spec.interpretResponse(BID_RESPONSE_VIDEO_OUTSTREAM, {
            data: 'invalid Json'
          })
        }).to.not.throw();
      });

      it('Smile Wanted - Verify parse response - Native', function () {
        const request = spec.buildRequests(NATIVE_REQUEST);
        const bids = spec.interpretResponse(BID_RESPONSE_NATIVE, request[0]);
        expect(bids).to.have.lengthOf(1);
        const bid = bids[0];
        expect(bid.cpm).to.equal(3);
        expect(bid.ad).to.equal('{"link":{"url":"https://www.smilewanted.com"},"assets":[{"id":0,"required":1,"title":{"len":50}},{"id":1,"required":1,"img":{"type":3,"w":150,"h":50,"ext":{"aspectratios":["2:1"]}}},{"id":2,"required":0,"img":{"type":1,"w":50,"h":50,"ext":{"aspectratios":["2:1"]}}},{"id":3,"required":1,"data":{"type":1,"value":"Smilewanted sponsor"}},{"id":4,"required":1,"data":{"type":2,"value":"Smilewanted Description"}}]}');
        expect(bid.width).to.equal(300);
        expect(bid.height).to.equal(250);
        expect(bid.creativeId).to.equal('crea_sw_1');
        expect(bid.currency).to.equal('EUR');
        expect(bid.netRevenue).to.equal(true);
        expect(bid.ttl).to.equal(300);
        expect(bid.requestId).to.equal(NATIVE_REQUEST[0].bidId);

        expect(function () {
          spec.interpretResponse(BID_RESPONSE_NATIVE, {
            data: 'invalid Json'
          })
        }).to.not.throw();
      });
    });

    it('Smile Wanted - Verify user sync - empty data', function () {
      let syncs = spec.getUserSyncs({iframeEnabled: true}, {}, {}, null);
      expect(syncs).to.have.lengthOf(1);
      expect(syncs[0].type).to.equal('iframe');
      expect(syncs[0].url).to.equal('https://csync.smilewanted.com');
    });

    it('Smile Wanted - Verify user sync', function () {
      let syncs = spec.getUserSyncs({iframeEnabled: true}, {}, {
        consentString: 'foo'
      }, '1NYN');
      expect(syncs).to.have.lengthOf(1);
      expect(syncs[0].type).to.equal('iframe');
      expect(syncs[0].url).to.equal('https://csync.smilewanted.com?gdpr_consent=foo&us_privacy=1NYN');

      syncs = spec.getUserSyncs({
        iframeEnabled: false
      }, [BID_RESPONSE_DISPLAY]);
      expect(syncs).to.have.lengthOf(0);

      syncs = spec.getUserSyncs({
        iframeEnabled: true
      }, []);
      expect(syncs).to.have.lengthOf(1);
    });
  });
});
