import { useMemo, useState } from 'react';
import type { HomeDecisionEvent, HomeDecisionTarget } from '../../decision/types/homeDecision';
import type { EarthSearchNdviStats } from '../../home-map/services/earthSearchNdvi.service';
import { getNdviDisplayPercentages } from '../../home-map/utils/ndviPercentages';
import KnowledgeQuickView from '../../knowledge/components/KnowledgeQuickView';
import KnowledgeEvidenceSources from '../../knowledge/components/KnowledgeEvidenceSources';

const PUSULA_INLINE_SRC = 'data:image/webp;base64,UklGRtIZAABXRUJQVlA4WAoAAAAQAAAAfwAAfwAAQUxQSEIKAAABR8egbSRH7+zzJ90bgIjIxR/LZbZc5DpbsuUwdpMtWO3GWVBuJxS2bRS1veOH/Qe+AzFCRP8nAH93rDfbmyRraxdj6u5h3OQTwBjDjBIp9Q5sSaKkVaTyFG+PwOnkZY0ROquktVaC5s7WtJZZAnenSzIzC6iV5N7nBjB/eGUoaNtGivnD3r0MImICeghnactiTW1sm3LRiXBR+dZJFbqr0Rbdo3JwakvbtrWNpOf9fsnhTIpSKWboHuYFzDXHvKc5nA3gHngHzMwzRdMdLAra0vce2FUdyenBk4iYAN+SJFmSJNkWUd8v//+T96d+LXoQUTWz6MvMY0RMAP/nqH/TPCj/Dyr8LiUQAjNufNL4jYQsCBBgQwIGnxzvCxKIIpEqxpZt2cbGOtkUSUJBCSFRlNCOyHDaaQQ6qRwqpChEtqZEXYvmQCA7oc0UgI5JUxaEkOq6KkWxcPbC6srS8vyMj/Zf7j5f39zeHzYeDdtACOukkeSIIEqtqM9fvn1vbW2p5tXDF1vrj3734K2jVEHymI7hc3UhSYFU0bznzptv3lgdAK2xJkgBjLYe/f4nv08qZWAh961LSRFRR8ON93/87gq4BYnXNaYItn+7cjAUoRTWcegUCAlFqYZ+/6dX1qFBiGO1qbh2ffXg7SwpEHpnqN5pLKJYH/zUYH19A4ku7YzFswsHL4Y1wUkoUlBqDS9/Znl9fUs1nRokMmbPDR48q8skX1DPioLR6S/eWl9/FrXdDRgh2jJYWn58VIx4U32SRBnMzN553yqjEGB1hmH95txH7w8GMwNJ7wypX5ELn7xPIwEY1ElsUMOtjyxERTDlpYoLV2eMmGzRV5GzV8612MchqReWFNXcmdO0YiqVLC8NjoeepD1qy/UrWExhgMy1ayCw/aCnRtX82cpiGkMYBOfqSgD+tACrSdeIaUwEApg7ikwb+lkqps2Xz0fJtKtt9p9bdvz0xm3z1n743y1dth/V2aSkfqlt261GTGNeCVDtjoYtvZYUbbvzBE/Fi+bBdjYh1B8k1Q/fYjzonfwhMb71OEOg3kgR/PgwDAK5zCWZ+VJ4g8Bq/17XAOqHUCgebheb4w35MjkXKBvKy98doR4Rs6M/Yx3XD41bkfr5YwX9VXhhP5iKvCgIsMFxmDtVgvpg29WLc7+PY73VO7jdC3l2bb2iHxJuh+3pPMjrAj16P9oz4TB9tGG0f7og+BGEXwgKaMyOsy8bG3eHM7ar06lIEf++CgECFHn6YNM26o42/oGMIMrbAX0S9zYZ+rsa08c83FgOgJj1zvQnuAkrlp4cgd1VmX67DFKCCnLqGX4x42hAObv4LEzXlXn0cEGYo/LBrA/oMC5i/sGodVdEqas31loBLt/rF+AigvL8jSjSb6RqMH8PI4WedNPFue46IDE1Ge+brQvfCopWbiImeqfe/GDZw3DvdETfIJW8dsOv2AuIe3tB78SNlgD55n1K+oWkQfWBpXwHqx/U8jhd1OHMxTfrwseKsngHM7El5fUgfrK5OleBX0iKpVXGI2YEdJMXAuEr4aEbOLM0I18KopxaQYBAMeNLkcsu8HQtVhYDP3EQC4uYcQXic3m5cOtkmB+k3IUD4uxsxgQQFKirfHDdjSLHahHMnQqQjw8FZbWY8bj2Zs0HAYUXq4toA7k+M0O3kupTGENAVEO+FkDWlogWBBeyujhrdSGjsgQIoPjRgUQxQxGEuNWZQSt8fITbWGSiHL2okSOgAmpRQI4CBXHMY8zPNDbHL+OqngS6hG66IDNk6nLpuHYR2zCYbehazSsEAeUn1qixe1B2SUAyxB0kNruvmCoQvSJ4kqmgW4HKveD5btJp/Wr4FL0GUBCft1wHUD1Aftk63Qk2u7yyokCwd8oDPlLjuoV8Pmpb+/ii2q1Wk4Rkja9l7QLQ0QiHNVzfbdJ0WI12juQJgACpp6ILL4AiHgbIGoDR4dYo6fQXYHdPTFbiRaENryDdWmI6NECw98KZ9vFl8XKf7qWF7ggIcHko2OblodN0Wn6+jV8VutgmxWzxRqDi3NLhuLlr212otS9dSGEhVrkWGi73Mj0ECF5I4auXshTRCb+uYnBdgMQqDwVIoptil6Mgt2ET15ZCoC6QMmivz6TEwy7QEoxjxFTkHNKSTCnnLnmmCjpVyyBvnkvxrBPIQwGZcqkFEqugvLDW1iF1gkZpl2/5VXm6F0gPIDRuA1VwA8Qbi4Q6IyritoBkDwmh05Rr8aIAoniYcU0zhc6FkmcWDCwJYcTs4v2YyjFAQF5ebIqiM3Dw7LSQTEL2EPysgAJQAgyZZXUXoR6EyssLsymKyNkRfRIgj2XGc+HMQYlA3UlxsHjRAsr9ArXUs0CuWyab8x6ZoIe2Yn0UcRsmM0yAeBwgBAYCsWvCYGZXsnsgcB48PZdPQGYgBNJoVCBHI9aQiY5T2y2il1K22jv/225IACGeC8RTk8ZqhGN2p0r3Y1zNzq950QAdCjoeG4DEpSDLw02DpX4Y9ORff85He+PYXSAg0xaZrO9tZBrTE2c2f/n1r3jaECGoKHYdQCYZ5gJYZPXz72dj+vyrX89duZjg1yLkoW60yRTkGDJwZnUl0+6Pykz56HLKukggQDy1xR4QIkdBqL14bW+mTXqEUMeZFeB19gBZBXSACyC7yxTV5dV6AKhHQIly6hrvMHDssgZBmyUQ0sncW6kinKbPoRgsrpaxajsqiOCQqQ0E4uns6nwtkr6rVLXOLYyhNwqgJKIQ02WV8mJpdWa2LnL/IoK5DEA5J7sgyFRIEkgE47LMVyVCdKlvKCTisPkXcnsBEggIIscEEALkn7ujuiB1xKtGoMYvWuzXYELIMY7hMm5AxnC0s39EIKZRKCLbo80tAvyKiYHgICBAZovGcOHtnWHTmr76BARpqV3fDyP7NQhICC1kRgg2Bgxb/zh0mwipH6/Kdnv46MELIpEwEAIYU5Q1IAQMZGF7Y2OUyJjufY1MO6vy4C9NyABmF3SBihmCQDLV7u/+StM0DWaqbTvb0dHDvzym2KC2NS4DEEBkFn71j/0cDttM7OkCsmmODp//+GcbVJg9PFSD2J2qqj9/5UvPmiZtm6m3M92OmtH6j3/0kKJfFKBxG6DUL1Hx2298+Zub+8NRi80JqL/iV5RVPt/OhcWaTAQIjDAyE20q6cXffrx35o1z0aZbcyLMX5VxyWf/XP/AG9cKkClgTExQIJ49/P0feONDa8OosrXNSSlgyKbJg+WL926tnl9eEIBtUIyNnj3bfutBnn7j8mxTBqHkpLVI2+1gUGJl7fzVa6fnZweDObXZHBzt7m6/vXuo5btrZwolFCFOWgFDtmVmUOpBlPmZuaX5ammQHu7tPx0O186fWqwRlUREMLV67WhHlFKqiIhShagqkcOREREqRQoVydPTuSGKFFFCKooSpBO3DRElpBDihNfEEFII2YbEYSkkTkp1AaKgYgAFYYx5F5XdmPFvpk4iqVf/hvouZuP/bfWu97/wVlA4IGoPAABwPQCdASqAAIAAPj0YikOiIaEUzQ6QIAPEtABpjmQA2+k80qvP3n+teW7r5jJdsPm31J+on86ewB+qf7Aerv6qv219Q/7Y/sb7yXo8/w/+Y/3fuAf4D/Xekj7FX7M+wB+t/pp/u78Gn7ffuL8C37Vf+7rAOAr/Brwt/un4m+cf4r9F/hfy8zkn4K/Y/3T0G/2vij8PdQL8i/mX+E4VsAv5z/U/+L/cvGL1g+/3+79wD9W/9f5U3hQUBP55/WP+7/gPyO+lj+i/8v+d88X5n/h//R/lfgF/kv9F/3n9v9sn2RftJ7IX60uIZQJnvp25r7y7ZNvV6zGF0SCepvUu/BHb54X4m3/aP5P5ldIr8eZ4TVFpl9bvOHCwQg+ldOlij4k+6gIjp9B36a6gFUL+PTqP+CgH9rNmBMLaM1ZfB0ugwhhsyrTthNWKxx+euuClfG4aNzgv2Fval57eEDbUKzitqhMmjMPaLQrRyG7wd2Naxh0A0zyuImW/I9BUah7wafSjoxIag/icfDg0XjjlwRVo9Zv36DecBv2PxOlaRxOEtkWG1OAVinnu2tFwXqPSTFWtvzTisb80GvVbUi/Q0BuEUY5HGviibDjShP7WJRfyl6PMth3pMfphlOP/8Vn9dX7wswRW0Qm+NJrj5RCX1nW5ImsLAAD+/2AYXPUVNN8Fp1RJsk18JiqJ+3vn+saX4sLv9y/3KYFLnnhPF+S7uVl9hJcFmv5J/yNXIYdndp+EcZjuahxNBgbDJJTk6LA0gm6nDY17Xx7xJ+72bxH8Ploh10N2Wc+Y6unASe+bjRhNt0pWbRuEm4UQTj82KH3W7Pyefi8mFJGPJ7yXTxOuZM+abRVHDk3Z19+D9+HwFOi6+x9FDqWULGroo41GXH8cGrmtqQ+l1rFD1OSPbpN/Cn2Ns27GiUChVwWlQNebQZKxZkoJ6CpaYggNUW6eWuOZTqP2Fma70yZa9qOuDhbvYcdwJ6OZ5E8+r9B+VghrPofXrgegoVlbpyHeeOsZxzPobWx+qagAL9Lf/EIZESEiJ8GA7in+aRfhhyi7gdwx55ug0WLXVpS5+URg9kX+CpQC+rDh2WtJhx1gI05HLxsGABng6/tJIjPl5GUhpidUdrDTpLD7vhLOBgZWp1m00dGo3+99r7p4FMBBxfWWTfCK0WdGcMG5FhO50vFIX72PXsi11UIUldAoqlbGhx7EMLR0bmIAmZ8oQjZXsmVST/zYnZLp+rnHHPNcbMMdBwF8iUGCF9G8VdJDzxzhM97a4NyrxLWtmMEyM132aD51VX9kLsU+ZospRz4Z8zKtisLT0aHfD9K13QQyfpSzB6cewfc9HlrkHsw+6HTvhXx11jRrKI9QC1cVJdM03lVdOjvLsEhhUH5XcNhJiq183gd1Wo962qFIR5Amufgo4mCMvSbwFnCO4R8m9Kv3ba4qjtX0/SbQumgsIr/s7JRrfVY1TGcISBqBgAM+99iH1YYoNrsAi0Jk/JTf76u700lmbbco9XrrI8wMGFKGL9jO+V3HqRljPy2CUuBk3e5ZdBOpGwXYJDeukSUoMAJr3D86gGM72YxjmSjGQCjdG8Mcq9MWw+JliLeKEFNhGnwoW1w3W3sbJj4Id//6PowgZote2N4hZDJij0I6ViQPyIB6/iXWu+3/KjANuQ582A8h3uiMXyTTYft2uSJ4H/TjOCDRErxygygh8/JKgVVkGdtVtZ2pJtgJJfL0V22EU9k+TfjonFQ6AZyHkDf1gnyH7GsViH+4G99wz51qRczKq4LLs1JW4gUo2Eo9bVrCwl/N108kMD2tdJwdKDzH9oRHWmoAf0n/65bZeX0LguFOmQdGQkiB9p79J2jMVx/hsIjS+Tu3HAXDsDv1p2tr366XxdPwsl77LOftYrG/mVaH9r0Kq0f3G47ya37gz6iY4XuZABFxt5XyWXaZgeONbKuqa1kDu0AFoaWVT4RZ2+TFtDqzCpv1sDpsIZkbWhg6HxHQIlSTldE7JCpLS2Ce02sjgpRY3pypqqKdV/Dux4LS8XDtf3kCC3t/O7MVOBx+nEVbkCXkOwb0CIg2HSxTnYoYMm3saLyDQM84j6qqr5HB8MCX71KCh/2ypf6WxCaqkIYhggr7hPd0ezU/fdc4bcHOkwsLcAMeOQvG7m7suFIHg+nxf0SqJLI+SBnfFQJl7t2Rumrpjsy1/MEY4LOnG6/Pfhm89RexE2UUbukPqI9xn23ULnXKk8+Zyg8Ylzs+0bhPRj9n2u6HLDN41e5t9Xib7/RPphEou/npzNYZJYvGA18TTAP+Lj0U0UnqvZpljEgxBr8FQkGh86tyn/6PeG2UYQgKSIOF76TnyhWT9k7q184j0DnQFzFHKe4cFUFw1FcdnKBViGi3HuHTICMVTs5CBocTqBL1/nzvtx78EOt7whcAXgJq3Q6x0xVx6YeolYn0s2Aj2ChSgyw0511HIKF/2KNzbjKlbl8tpXEbFa6S5gmcE8owGg81Q1vXsARbuW4JkhOZF3AlP2YfcGDvrDy2V7J1DhZ84XroEzs/jWjpcmRDDXdgSkq/yNKS1JVvbDTRmDcgyehBbUcLPraclN6hMtCH+6CEIj050fRiL2wZxbN9mQUbHb7mVv+WbjOu9Be0h5va8fB92ZhkHkdEB5e9osNl5NrNsrpgx/UlckNYtxNlr8p0/CBvGzU4YAgKnP4RnpPzRBTtYixYvm9VT5q5pPP+ZUMcRr0UhqCpd3lZXg0VwX4/i5mcg4gwpxrRuUKmvrull5Z/vBR7MhDJDGaqmrCq3i1pVFD3QizHQmms1gndiV/hnn4SPXT2LUDgRCLJihMW1jFx0PAhkSzhDfXfM8tiPctr4W/po4Fzap2VzROgbR2LRj6Xi2F1HozGCB8I0rMu2MyraeiCY2V3uMEOUE5jmxmcvpzS//eM5YN1gornAsIYp0mfEMlcJR+vOKrZxiuXhpR8ZSvB4sjOYCPpJjkgAWn/hYjbG2nK3PyvH1I2nLQbeOjUITpUVyfT/w7KIeUKBT52LkYAFtr7QBjjCh6q34LkrO9gLJAgkylEkKltTDIsYWa+kbVS692+2QYLkh4Ry7a0PJ2IwZk0/lhXPRfw2r/LZbl/4fI3+FtggO/b+ss0yUVU+vCjzz7g+LQdnetN0Ggv+pOzUqqhOTbKLbtcDtsEMqnl3bjfv+28K+aGU94H//BA8j2HBPag1WNUKKlcfxOPIyB5MVpKkIqOVm9sKVzHVlhf0zZETKNXoIQltlKLSy0q/Qb1OHkPbv9KPHNUPLcxzJ34Kpf8A+L3BNSiPbXiziUI8/O8eEiKsBnKg4pRR4D2Ry+g6QG/XnHDY5g1S2vN2zt+xWL0lZmpqOfVF3ue7B3S+sUM6ZV/LxG0RlBTy1IqoI/fGbkHeDzV04R+lKlYP5k/q5TfVQ0Hx3hJhpvg4DjV/j60omLpkr90c2pj80WV8NeZlXk550PS2GgXBUyuW+vQPtmjT14r6hqYw2Z66/02ewLWk9+2pO4C4b2pzJq8Sf8Gh9fP0VBwSNOK1yXcdsgPIgAY6TTOPiWTCyo/D5l/M8kEkY8aRB/piBizK9NdGfv+BmTdD67pXTH+67kXwfU4qBvFwFuAbIWZyv0Y4WmmN9DSFaqOscGCmwqSmz//uDG6j7PhdYn/AZkUKUuo+Znkl5V2FDn49cw4T1UYxu4q7bleheC4wGJ47eAgfQ4aH8v6Nq1AmzarPbJiAi6YsVM+sefspgClpLbFMIJ8GfjB3THbSlzMiUOXliXuBt0xMUsQhP261K36jbjVmC76LMbIRr3eX+jOX1lhzYBt88IFeal/7cMYPQ9N+gQ1otQKLz+pKvPB48repufXsG2b3pukiXVbQ8yCvjy1L6/jKd0Nqyt91CepP+MqTTst2QiFpXf4bgl/weXtzmA6/dsv5AonIpUAyRpaG44Kt/3LbgT6dly1/n7e2ipblAVMwSOTa6S4p8tfjoGVCqZAdQ286WbAEHWLyvGhIwkmGXzIKrBn5KQ5E+JAjHsZJ0yWbnHyLlm14hkLCuti+TWl+OBSz7dfIMIQsNiINFQUxP2X7aSyXzP3o+E5hhMOMiKqSMkLwB15pP4tTpaWuq/5b1M2Lm+BU7mhexTHelLvwwb5r12bGda/4nNw8AF4BVv5bPvC4PYemzEc6qp9z0bNyntMvyWtA3My0h81LRHUL+GH51dswDexyivk97r0l3duTcV0aTRIR+N7G2syMUnxMp4XBDmv1N5rBdEvai67veWS1++ukMdLFT80PcSu3hX0Ev8C8OKUUmKTTPsRiD+Cu+d2OQYZnSi58A+qdR/1xqz2kWv3Hq4PtdI4n3Ei5p3W8JrTC5UEQWcBYvTJNtwe7rlKDDgPIoOIVvqrzEAdg7LH6IrBEyz8ou+tcn/iYLBhGspV6PNaT1/z16eVfYVWMo1dhOqlumG0kqN0y7vk8McjQQaEEp8JtOoG0bqAJTCF4Wf+Thhf3xXupaHv/6ZMMA1TQ0mrVg7ExrQktzd3/Ct79lAHd8+Z4/+EE31yiZkPGGnYeiqZT/TYef/S7ReaNGe7UM8bhe0zP85MvSVVNATZDtSVppaxBO/4ZeovEyXhf/HnId4VdchyD40s0fqIaZz6sK8nWP1vCZ8x5kSjb8abxScH/PizsuDTykRvlcO//SH6c1hEVuJWa8AcL5v1lLwCDhDDeH1d4dxBkjBxsNUrdaOZtVSFXCd02s6BhRh3Wdf4xWOEVxG3SlFiCadLbsve09BHCwOR0PrNCmn4ttDrU1reB+VqS5w5r+nyqVTil/koOEDVHact0aQDD5Nq1e5KxVpcMAyj58iefi2d5XQZpNHCggFeDtSYYDTkw1cfV0f/lbOFcN436ezEN/6r+CJ6ipkT4G5D9txtG36kJjwAB4SOm17eCC3aWmM5yzWJ1tP3cXeC7mai8geuKWpHr6Vegv2dl3AOlCuNNNNv0KpcblYUWnq1tVYCpKT6f6Qmz+AnmXzcPibdempQ+NGyDZCJni2qHMIMwlGc167H9wPpXaDSSFxhS7GEWjt/NkhbEVYMkKLsh79dP2JM33Pjf7/gR+NSnkOTN5+mMxdfXg0I7v6ZKs5M1rdo0E/AAAAFCCUA4PalsZYZ+wrc867V9c+XNT74LPiKcBFuIHvVsj59xWlV/SCdOUMifbqsxVh+FYLJz8D3ViX9g9PHpv/OKr79iR+58x8opM7/RTp/Me8PRXUSriQLtFpEhAkpWHE0/Nju/9sAggPe6AAAAAAA';

type Props = {
  fieldName: string;
  layerLabel: string;
  activeLayer?: string | null;
  soilProperty?: string | null;
  climateLayer?: string | null;
  loading: boolean;
  dataStatusMessage?: string;
  headline?: string | null;
  summary?: string | null;
  result?: any;
  synthesis?: any;
  ndviStats?: EarthSearchNdviStats | null;
  error?: string | null;
  decision?: HomeDecisionEvent | null;
  onOpenDecision?: (target: HomeDecisionTarget) => void;
  onOpenLayer?: (layer: string) => void;
  onRefresh?: () => void | Promise<void>;
  showOnMapAvailable?: boolean;
  onShowOnMap: () => void;
};

const CSS = String.raw`
.tp-home-map-pusula-shell {
  position: relative;
}

/*
 * Haritanın kendi alt gövdesini kullanıyoruz.
 * Ayrı kart yok; Pusula aynı yüzeyin içine yerleşiyor.
 */
.tp-home-map-pusula-shell .tp-field-stats {
  height: 108px !important;
  min-height: 108px !important;
  overflow: hidden !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

.tp-home-map-pusula-strip {
  position: absolute;
  z-index: 18;
  left: 1px;
  right: 1px;
  bottom: 1px;
  height: auto;
  min-height: 108px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  padding: 9px 12px 8px;
  box-sizing: border-box;

  /* Harita kartından ayrı duran border/glow tamamen kaldırıldı. */
  border: 0;
  border-radius: 0 0 18px 18px;
  background:
    linear-gradient(
      180deg,
      rgba(3, 8, 5, .70) 0%,
      rgba(2, 7, 4, .91) 32%,
      rgba(2, 7, 4, .985) 100%
    );
  box-shadow: none;
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
}

/* Haritanın bittiği yerde sert çizgi yerine görüntü alt alana eriyor. */
.tp-home-map-pusula-strip::before {
  content: '';
  position: absolute;
  z-index: -1;
  left: 0;
  right: 0;
  top: -20px;
  height: 22px;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(2, 7, 4, 0) 0%,
      rgba(2, 7, 4, .26) 42%,
      rgba(2, 7, 4, .72) 100%
    );
}

.tp-home-map-pusula-logo {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;

  /* İkon ayrı buton gibi değil, haritanın etiketi gibi. */
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  opacity: .88;
}

.tp-home-map-pusula-logo img {
  display: block;
  width: 25px;
  height: 25px;
  object-fit: contain;
  filter: saturate(.82) brightness(.96);
}

.tp-home-map-pusula-copy {
  min-width: 0;
}

.tp-home-map-pusula-kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(133, 183, 146, .92);
  font-size: 7.5px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: .085em;
  text-transform: uppercase;
}

.tp-home-map-pusula-kicker::after {
  content: '';
  width: 3px;
  height: 3px;
  flex: 0 0 3px;
  border-radius: 999px;
  background: rgba(133, 183, 146, .38);
}

.tp-home-map-pusula-kicker span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(166, 183, 171, .48);
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}


.tp-home-map-pusula-signal {
  display: inline-flex;
  align-items: center;
  min-height: 15px;
  margin-left: 2px;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid rgba(166, 183, 171, .12);
  background: rgba(166, 183, 171, .04);
  color: rgba(196, 209, 199, .68);
  font-size: 6.4px;
  line-height: 1;
  font-weight: 900;
  font-style: normal;
  letter-spacing: .055em;
  text-transform: uppercase;
}

.tp-home-map-pusula-signal.negative {
  border-color: rgba(239, 68, 68, .22);
  background: rgba(239, 68, 68, .07);
  color: rgba(252, 165, 165, .92);
}

.tp-home-map-pusula-signal.positive {
  border-color: #cbd2d9;
  background: #e8ebee;
  color: #303942;
}

.tp-home-map-pusula-signal.attention {
  border-color: rgba(245, 158, 11, .18);
  background: rgba(245, 158, 11, .055);
  color: rgba(253, 186, 116, .86);
}

.tp-home-map-pusula-signal.neutral {
  color: rgba(181, 197, 185, .62);
}

.tp-home-map-pusula-text {
  margin: 5px 0 0;
  max-width: 100%;
  overflow: visible;
  display: block;
  color: rgba(232, 239, 233, .93);
  font-size: 10.5px;
  line-height: 1.32;
  font-weight: 690;
}

.tp-home-map-pusula-metrics {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}

.tp-home-map-pusula-metric {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 6px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  background: rgba(148, 163, 184, .10);
  color: rgba(224, 232, 226, .82);
  font-size: 7px;
  line-height: 1;
  font-weight: 820;
  white-space: nowrap;
}

.tp-home-map-pusula-metric.source {
  color: rgba(166, 183, 171, .70);
  font-weight: 760;
}

html body .tp-v1 .tp-home-map-pusula-metric {
  border-color: #d5dbe1;
  background: #e7ebef;
  color: #24303b;
}

html body .tp-v1 .tp-home-map-pusula-metric.source {
  color: #52606d;
}

.tp-home-map-pusula-strip.is-loading .tp-home-map-pusula-text,
.tp-home-map-pusula-strip.has-error .tp-home-map-pusula-text {
  color: rgba(183, 196, 187, .62);
  font-weight: 620;
}

.tp-home-map-pusula-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  white-space: nowrap;
}

.tp-home-map-pusula-actions button {
  min-height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font: inherit;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background .16s ease,
    color .16s ease;
}

/* Aynı renk ailesi: bağımsız cyan/emerald CTA görünümü yok. */
.tp-home-map-pusula-why {
  color: rgba(159, 190, 166, .72);
}

.tp-home-map-pusula-show {
  color: rgba(180, 207, 186, .86);
}

.tp-home-map-pusula-refresh {
  width: 25px;
  height: 25px;
  min-width: 25px;
  min-height: 25px;
  display: inline-grid;
  place-items: center;
  padding: 0 !important;
  border: 1px solid rgba(255, 255, 255, .08) !important;
  border-radius: 7px !important;
  background: rgba(255, 255, 255, .025) !important;
  color: rgba(226, 236, 229, .88);
  font-size: 14px !important;
  line-height: 1 !important;
}

.tp-home-map-pusula-refresh span {
  display: block;
  line-height: 1;
  transform-origin: 50% 50%;
}

.tp-home-map-pusula-refresh span.is-spinning {
  animation: tpHomeMapRefreshSpin .72s linear infinite;
}

@keyframes tpHomeMapRefreshSpin {
  to { transform: rotate(360deg); }
}

.tp-home-map-pusula-actions button:hover {
  color: rgba(221, 236, 225, .96);
  background: rgba(145, 176, 153, .055);
}

.tp-home-map-pusula-actions button:disabled {
  display: none;
}

.tp-home-map-pusula-actions .tp-home-map-pusula-refresh:disabled {
  display: inline-grid;
  opacity: .58;
  cursor: wait;
}

/*
 * Neden? detayları ana harita kartını büyütmüyor.
 * Sheet de aynı obsidian-green yüzey ailesini kullanıyor.
 */
.tp-home-map-why-backdrop {
  position: fixed;
  inset: 0;
  z-index: 190;
  border: 0;
  background: rgba(0, 0, 0, .56);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.tp-home-map-why-sheet {
  position: fixed;
  z-index: 191;
  left: 50%;
  bottom: max(14px, env(safe-area-inset-bottom));
  width: min(92vw, 460px);
  transform: translateX(-50%);
  overflow: hidden;
  border: 1px solid rgba(105, 139, 114, .16);
  border-radius: 20px;
  background:
    radial-gradient(circle at 8% 0%, rgba(69, 111, 79, .08), transparent 30%),
    rgba(3, 12, 7, .99);
  box-shadow: 0 24px 70px rgba(0, 0, 0, .58);
}

.tp-home-map-why-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px 10px;
  border-bottom: 1px solid rgba(105, 139, 114, .10);
}

.tp-home-map-why-head div {
  min-width: 0;
}

.tp-home-map-why-head small {
  display: block;
  color: rgba(142, 187, 153, .82);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.tp-home-map-why-head strong {
  display: block;
  margin-top: 4px;
  color: rgba(233, 240, 234, .94);
  font-size: 13px;
}

.tp-home-map-why-close {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border: 1px solid rgba(255, 255, 255, .06);
  border-radius: 10px;
  background: rgba(255, 255, 255, .018);
  color: rgba(215, 228, 218, .80);
  font-size: 19px;
  cursor: pointer;
}

.tp-home-map-why-body {
  padding: 12px 14px 14px;
}

.tp-home-map-why-body ul {
  margin: 0;
  padding-left: 17px;
  color: rgba(217, 229, 220, .78);
  font-size: 10.5px;
  line-height: 1.5;
}

.tp-home-map-why-body li + li {
  margin-top: 5px;
}

.tp-home-map-why-action {
  margin: 10px 0 0;
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid rgba(105, 139, 114, .11);
  background: rgba(105, 139, 114, .035);
  color: rgba(216, 230, 219, .78);
  font-size: 10px;
  line-height: 1.45;
}

.tp-home-map-why-action-link {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid rgba(105, 190, 125, .26);
  border-radius: 10px;
  background: rgba(18, 61, 33, .35);
  color: #c7e9cf;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}


.tp-home-map-why-layers {
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid rgba(105, 139, 114, .10);
}

.tp-home-map-why-layers-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.tp-home-map-why-layers-title strong {
  color: rgba(231, 239, 233, .90);
  font-size: 9px;
  font-weight: 900;
}

.tp-home-map-why-layers-title span {
  color: rgba(151, 169, 156, .48);
  font-size: 7px;
  font-weight: 700;
}

.tp-home-map-why-layer-list {
  display: grid;
  gap: 6px;
}

.tp-home-map-why-layer {
  width: 100%;
  min-height: 48px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 7px 8px;
  border: 1px solid rgba(105, 139, 114, .11);
  border-radius: 11px;
  background: rgba(255, 255, 255, .015);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.tp-home-map-why-layer:hover {
  border-color: rgba(124, 164, 134, .22);
  background: rgba(105, 139, 114, .045);
}

.tp-home-map-why-layer:disabled {
  cursor: default;
  opacity: .72;
}

.tp-home-map-why-layer-icon {
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  border: 1px solid rgba(105, 139, 114, .12);
  background: rgba(8, 24, 13, .70);
  color: rgba(142, 187, 153, .88);
  font-size: 11px;
}

.tp-home-map-why-layer-copy {
  min-width: 0;
}

.tp-home-map-why-layer-copy strong {
  display: block;
  overflow: hidden;
  color: rgba(232, 240, 234, .92);
  font-size: 8.5px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tp-home-map-why-layer-copy span {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: rgba(181, 198, 185, .58);
  font-size: 7.2px;
  line-height: 1.28;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tp-home-map-why-layer-status {
  min-height: 17px;
  display: inline-flex;
  align-items: center;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid rgba(166, 183, 171, .11);
  color: rgba(190, 205, 194, .68);
  font-size: 6px;
  font-weight: 900;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.tp-home-map-why-layer-status.dikkat {
  border-color: rgba(239, 68, 68, .18);
  background: rgba(239, 68, 68, .055);
  color: rgba(252, 165, 165, .88);
}

.tp-home-map-why-layer-status.kontrol {
  border-color: rgba(245, 158, 11, .16);
  background: rgba(245, 158, 11, .045);
  color: rgba(253, 186, 116, .84);
}

.tp-home-map-why-layer-status.normal {
  border-color: #cbd2d9;
  background: #e8ebee;
  color: #303942;
}

@media (max-width: 560px) {
  .tp-home-map-pusula-shell .tp-field-stats {
    height: 116px !important;
    min-height: 116px !important;
  }

  .tp-home-map-pusula-strip {
    height: auto;
    min-height: 116px;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 8px;
    padding: 9px 10px 7px;
  }

  .tp-home-map-pusula-logo {
    width: 26px;
    height: 26px;
  }

  .tp-home-map-pusula-logo img {
    width: 23px;
    height: 23px;
  }

  .tp-home-map-pusula-copy {
    padding-bottom: 24px;
  }

  .tp-home-map-pusula-text {
    font-size: 10px;
  }

  .tp-home-map-pusula-actions {
    position: absolute;
    right: 7px;
    bottom: 4px;
  }

  .tp-home-map-pusula-actions button {
    min-height: 23px;
    padding: 0 5px;
    font-size: 7.8px;
  }
}

/* =========================================================
   V10-WHITE — PUSULA AÇIKLAMA KARTI
   - Kart kaldırılmaz; ana haritanın içinde alt overlay olarak kalır.
   - Eski yeşil/obsidian yüzey geri dönmez.
   - Yükseklik içerikten gelir; aşağıda ayrı boş stats alanı kullanılmaz.
   ========================================================= */
.tp-home-map-pusula-strip{
  min-height:0!important;
  height:auto!important;
  padding:9px 11px 9px!important;
  border:1px solid rgba(15,23,42,.14)!important;
  border-radius:16px!important;
  background:rgba(255,255,255,.97)!important;
  box-shadow:0 7px 22px rgba(15,23,42,.14)!important;
  backdrop-filter:blur(10px)!important;
  -webkit-backdrop-filter:blur(10px)!important;
  color:#111827!important;
}

.tp-home-map-pusula-strip::before{
  display:none!important;
}

.tp-home-map-pusula-logo{
  opacity:1!important;
}

.tp-home-map-pusula-logo img{
  filter:none!important;
}

.tp-home-map-pusula-kicker{
  color:#111827!important;
}

.tp-home-map-pusula-kicker span{
  color:#687386!important;
}

.tp-home-map-pusula-kicker::after{
  background:#d4d9df!important;
}

.tp-home-map-pusula-text{
  color:#151b24!important;
  font-size:10px!important;
  line-height:1.28!important;
  font-weight:690!important;
  margin-top:4px!important;
}

.tp-home-map-pusula-strip.is-loading .tp-home-map-pusula-text,
.tp-home-map-pusula-strip.has-error .tp-home-map-pusula-text{
  color:#667085!important;
}

.tp-home-map-pusula-metrics{
  gap:4px!important;
  margin-top:5px!important;
}

.tp-home-map-pusula-metric{
  min-height:17px!important;
  padding:0 6px!important;
  border-color:#d8dde3!important;
  background:#edf0f3!important;
  color:#344054!important;
  font-size:6.8px!important;
}

.tp-home-map-pusula-metric.source{
  color:#596574!important;
}

.tp-home-map-pusula-signal{
  border-color:#d8dde3!important;
  background:#f1f3f5!important;
  color:#4b5563!important;
}

.tp-home-map-pusula-signal.positive{
  border-color:#cbd2d9!important;
  background:#e8ebee!important;
  color:#303942!important;
}

.tp-home-map-pusula-actions{
  gap:2px!important;
}

.tp-home-map-pusula-actions button{
  color:#4b5563!important;
}

.tp-home-map-pusula-actions button:hover{
  color:#111827!important;
  background:#f1f3f5!important;
}

.tp-home-map-pusula-refresh{
  border-color:#d8dde3!important;
  background:#f4f5f6!important;
  color:#374151!important;
}

.tp-home-map-pusula-refresh-error{
  color:#7a4650!important;
}

@media(max-width:560px){
  .tp-home-map-pusula-strip{
    grid-template-columns:26px minmax(0,1fr)!important;
    gap:7px!important;
    padding:8px 10px 8px!important;
  }

  .tp-home-map-pusula-copy{
    padding-bottom:22px!important;
  }

  .tp-home-map-pusula-actions{
    right:7px!important;
    bottom:4px!important;
  }
}


/* =========================================================
   V11-COMPACT-MAP-INTEGRATED
   2026-10-01
   - Alt NDVI yüzde/source chip satırı kaldırıldı.
   - Pusula bilgi kartı artık ayrı yüzen kart değil:
     harita kartının alt parçası gibi sıfır boşlukla oturur.
   - Mobilde aksiyonlar normal akışta kompakt durur.
   ========================================================= */
.tp-home-map-pusula-strip{
  min-height:0!important;
  height:auto!important;
  padding:7px 10px 7px!important;
  border:0!important;
  border-top:1px solid #d8dde3!important;
  border-radius:0 0 18px 18px!important;
  background:rgba(255,255,255,.985)!important;
  box-shadow:none!important;
  backdrop-filter:blur(8px)!important;
  -webkit-backdrop-filter:blur(8px)!important;
}

.tp-home-map-pusula-strip::before{
  display:none!important;
}

.tp-home-map-pusula-logo{
  width:24px!important;
  height:24px!important;
}

.tp-home-map-pusula-logo img{
  width:22px!important;
  height:22px!important;
}

.tp-home-map-pusula-copy{
  min-width:0!important;
  padding:0!important;
}

.tp-home-map-pusula-kicker{
  gap:5px!important;
  font-size:7px!important;
}

.tp-home-map-pusula-text{
  margin:3px 0 0!important;
  font-size:9.8px!important;
  line-height:1.24!important;
  font-weight:690!important;
}

.tp-home-map-pusula-metrics{
  display:none!important;
}

.tp-home-map-pusula-actions{
  position:static!important;
  grid-column:2 / -1!important;
  display:flex!important;
  justify-content:flex-end!important;
  align-items:center!important;
  gap:2px!important;
  margin-top:3px!important;
  white-space:nowrap!important;
}

.tp-home-map-pusula-actions button{
  min-height:21px!important;
  padding:0 5px!important;
  font-size:7px!important;
  border-radius:6px!important;
}

.tp-home-map-pusula-refresh{
  width:22px!important;
  min-width:22px!important;
  height:22px!important;
  min-height:22px!important;
}

@media(max-width:560px){
  .tp-home-map-pusula-strip{
    min-height:0!important;
    grid-template-columns:24px minmax(0,1fr)!important;
    gap:6px!important;
    padding:7px 9px 6px!important;
  }

  .tp-home-map-pusula-copy{
    padding:0!important;
  }

  .tp-home-map-pusula-actions{
    position:static!important;
    right:auto!important;
    bottom:auto!important;
    grid-column:2!important;
    margin-top:3px!important;
  }

  .tp-home-map-pusula-actions button{
    min-height:20px!important;
    font-size:6.8px!important;
  }
}


/* =========================================================
   V12 — FINAL ENTEGRE PUSULA ALTLIĞI
   2026-10-01
   - NDVI yüzde/source chip satırı yok.
   - Ayrı yüzen kart görünümü yok.
   - Harita kartının alt gövdesi gibi kompakt.
   ========================================================= */
.tp-home-map-pusula-strip{
  position:relative!important;
  min-height:0!important;
  height:auto!important;
  display:grid!important;
  grid-template-columns:24px minmax(0,1fr) auto!important;
  align-items:center!important;
  column-gap:7px!important;
  row-gap:0!important;

  padding:7px 9px 7px!important;
  margin:0!important;

  border:1px solid #20262e!important;
  border-top:1px solid #d8dde3!important;
  border-radius:0 0 18px 18px!important;

  background:#f8f9fa!important;
  box-shadow:none!important;
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important;
  color:#111827!important;
}

.tp-home-map-pusula-strip::before{
  display:none!important;
}

.tp-home-map-pusula-logo{
  width:24px!important;
  height:24px!important;
  border:0!important;
  background:transparent!important;
  box-shadow:none!important;
}

.tp-home-map-pusula-logo img{
  width:21px!important;
  height:21px!important;
  filter:none!important;
}

.tp-home-map-pusula-copy{
  min-width:0!important;
  padding:0!important;
}

.tp-home-map-pusula-kicker{
  min-height:14px!important;
  display:flex!important;
  align-items:center!important;
  gap:4px!important;
  color:#111827!important;
  font-size:6.7px!important;
  line-height:1!important;
  font-weight:900!important;
}

.tp-home-map-pusula-kicker span{
  color:#697586!important;
}

.tp-home-map-pusula-kicker::after{
  display:none!important;
}

.tp-home-map-pusula-signal{
  min-height:14px!important;
  margin-left:0!important;
  padding:0 4px!important;
  font-size:6px!important;
  border-color:#d7dce2!important;
  background:#eef1f3!important;
  color:#4b5563!important;
}

.tp-home-map-pusula-text{
  margin:3px 0 0!important;
  max-width:100%!important;
  color:#171c24!important;
  font-size:9.4px!important;
  line-height:1.22!important;
  font-weight:680!important;
}

.tp-home-map-pusula-metrics{
  display:none!important;
}

.tp-home-map-pusula-actions{
  position:static!important;
  grid-column:3!important;
  grid-row:1!important;
  align-self:start!important;
  display:flex!important;
  align-items:center!important;
  justify-content:flex-end!important;
  gap:2px!important;
  margin:0!important;
  white-space:nowrap!important;
}

.tp-home-map-pusula-actions button{
  min-height:20px!important;
  height:20px!important;
  padding:0 5px!important;
  border:0!important;
  border-radius:6px!important;
  background:transparent!important;
  color:#4b5563!important;
  font-size:6.8px!important;
  line-height:1!important;
  box-shadow:none!important;
}

.tp-home-map-pusula-actions button:hover{
  background:#eceff2!important;
  color:#111827!important;
}

.tp-home-map-pusula-refresh{
  width:20px!important;
  min-width:20px!important;
  height:20px!important;
  min-height:20px!important;
  padding:0!important;
  border:1px solid #dde1e6!important;
  background:#f2f4f6!important;
}

.tp-home-map-pusula-refresh-error{
  display:block!important;
  margin-top:3px!important;
  color:#7b4a52!important;
  font-size:7px!important;
  line-height:1.2!important;
}

@media(max-width:560px){
  .tp-home-map-pusula-strip{
    grid-template-columns:23px minmax(0,1fr) auto!important;
    column-gap:6px!important;
    padding:6px 8px 6px!important;
  }

  .tp-home-map-pusula-logo{
    width:23px!important;
    height:23px!important;
  }

  .tp-home-map-pusula-logo img{
    width:20px!important;
    height:20px!important;
  }

  .tp-home-map-pusula-text{
    font-size:9.2px!important;
    line-height:1.2!important;
  }

  .tp-home-map-pusula-actions{
    position:static!important;
    grid-column:3!important;
    grid-row:1!important;
    right:auto!important;
    bottom:auto!important;
    margin:0!important;
  }

  .tp-home-map-pusula-actions button{
    min-height:19px!important;
    height:19px!important;
    padding:0 4px!important;
    font-size:6.5px!important;
  }

  .tp-home-map-pusula-refresh{
    width:19px!important;
    min-width:19px!important;
    height:19px!important;
    min-height:19px!important;
  }
}


/* =========================================================
   V14 — PUSULA AKSİYON BUTONLARI / KALICI
   2026-10-01
   Yalnız sağ aksiyon grubu.
   Harita, NDVI, tarih ve Pusula kart geometrisine dokunmaz.
   ========================================================= */

/* Sağ sütuna gerçek buton genişliği ayır. */
.tp-home-map-pusula-strip{
  grid-template-columns:23px minmax(0,1fr) 90px!important;
  column-gap:7px!important;
}

/* Üç buton kesin olarak ALT ALTA. */
.tp-home-map-pusula-actions{
  position:static!important;
  grid-column:3!important;
  grid-row:1!important;
  align-self:center!important;
  justify-self:stretch!important;

  width:90px!important;
  min-width:90px!important;
  margin:0!important;

  display:grid!important;
  grid-template-columns:1fr!important;
  grid-auto-flow:row!important;
  gap:4px!important;

  white-space:normal!important;
}

/* Yazı değil, BASILABİLİR BUTON olduğu açıkça belli olsun. */
.tp-home-map-pusula-actions button{
  position:relative!important;
  width:100%!important;
  min-width:0!important;
  min-height:25px!important;
  height:auto!important;

  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:4px!important;

  margin:0!important;
  padding:5px 6px!important;

  border:1px solid #cfd5dc!important;
  border-radius:7px!important;
  background:#ffffff!important;
  box-shadow:
    0 1px 2px rgba(15,23,42,.08),
    inset 0 -1px 0 rgba(15,23,42,.04)!important;

  color:#293340!important;
  font-size:8.6px!important;
  line-height:1.12!important;
  font-weight:800!important;
  text-align:center!important;
  white-space:normal!important;

  cursor:pointer!important;
}

.tp-home-map-pusula-actions button:hover{
  border-color:#aeb7c1!important;
  background:#f2f4f6!important;
  color:#111827!important;
}

.tp-home-map-pusula-actions button:active{
  transform:translateY(1px)!important;
  background:#e9edf1!important;
}

.tp-home-map-pusula-actions button:disabled{
  display:flex!important;
  opacity:.48!important;
  cursor:not-allowed!important;
}

/* Yenile artık ikon + metin olan gerçek buton. */
.tp-home-map-pusula-refresh{
  width:100%!important;
  min-width:0!important;
  min-height:25px!important;
  height:auto!important;
  padding:5px 6px!important;

  border:1px solid #cfd5dc!important;
  background:#f5f7f8!important;
}

.tp-home-map-pusula-refresh > span:first-child{
  display:inline-block!important;
  width:11px!important;
  flex:0 0 11px!important;
  font-size:11px!important;
  line-height:1!important;
}

.tp-home-map-pusula-refresh-label{
  display:inline!important;
  font-size:8.6px!important;
  line-height:1!important;
  font-weight:850!important;
}

/* "Neden?" ve "Göreli farkı göster" de aynı buton ailesi. */
.tp-home-map-pusula-why,
.tp-home-map-pusula-show{
  border:1px solid #cfd5dc!important;
  background:#fff!important;
  color:#293340!important;
}

.tp-home-map-pusula-show{
  min-height:30px!important;
}

/* Mobilde de kesinlikle tek satıra dönmesin. */
@media(max-width:560px){
  .tp-home-map-pusula-strip{
    grid-template-columns:22px minmax(0,1fr) 88px!important;
    column-gap:6px!important;
  }

  .tp-home-map-pusula-actions{
    position:static!important;
    grid-column:3!important;
    grid-row:1!important;
    align-self:center!important;

    width:88px!important;
    min-width:88px!important;

    display:grid!important;
    grid-template-columns:1fr!important;
    grid-auto-flow:row!important;
    gap:4px!important;

    right:auto!important;
    bottom:auto!important;
  }

  .tp-home-map-pusula-actions button{
    width:100%!important;
    min-height:24px!important;
    padding:5px 5px!important;
    font-size:8.3px!important;
    line-height:1.1!important;
  }

  .tp-home-map-pusula-refresh{
    width:100%!important;
    min-width:0!important;
    min-height:24px!important;
  }

  .tp-home-map-pusula-refresh-label{
    font-size:8.3px!important;
  }

  .tp-home-map-pusula-show{
    min-height:30px!important;
  }
}

`

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(value: unknown) {
  const text = cleanText(value);
  if (!text) return '';

  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return cleanText(match?.[0] ?? text);
}

function completeSentence(value: unknown) {
  const sentence = firstSentence(value);
  if (!sentence) return '';

  // Pusula ana satırında karakter sayısına göre kesip "…" eklemiyoruz.
  // Kullanıcı ya tam cümleyi görür ya da CSS satır düzeni içinde sarılır.
  return sentence;
}

function trimCompact(value: unknown, max = 112) {
  const text = firstSentence(value);
  if (!text || text.length <= max) return text;

  const clipped = text.slice(0, max - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  const safe = lastSpace > max * .68 ? clipped.slice(0, lastSpace) : clipped;

  return `${safe.replace(/[.,;:!?]+$/, '')}…`;
}

function titleArea(value: unknown) {
  const text = cleanText(value);
  if (!text) return '';
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1);
}


type PusulaSignalTone =
  | 'negative'
  | 'positive'
  | 'attention'
  | 'neutral';

type PusulaSignal = {
  tone: PusulaSignalTone;
  label: string;
  text?: string;
};

function numberOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sameArea(a: unknown, b: unknown) {
  return (
    cleanText(a).toLocaleLowerCase('tr-TR') ===
    cleanText(b).toLocaleLowerCase('tr-TR')
  );
}


function formatAreaList(areas: string[]) {
  const clean = Array.from(
    new Set(
      areas
        .map((area) => titleArea(area))
        .filter(Boolean),
    ),
  );

  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) {
    return `${clean[0]} ve ${clean[1]}`;
  }

  return `${clean.slice(0, -1).join(', ')} ve ${clean[clean.length - 1]}`;
}

type NdviRelativeWeakArea = {
  area: string;
  mean: number | null;
  fieldMean: number | null;
  delta: number | null;
  relativeHealth: number | null;
};

function relativeWeakVegetationAreas(result: any): NdviRelativeWeakArea[] {
  const findings =
    result?.context?.ndvi?.spatial?.findings;

  if (!Array.isArray(findings)) return [];

  return findings
    .map((finding: any): NdviRelativeWeakArea & { status: string } => ({
      area: cleanText(finding?.area ?? finding?.direction),
      mean: numberOrNull(finding?.ndvi?.mean),
      fieldMean: numberOrNull(finding?.ndvi?.fieldMean),
      delta: numberOrNull(finding?.ndvi?.deltaFromFieldMean),
      relativeHealth: numberOrNull(finding?.ndvi?.relativeHealth),
      status: cleanText(finding?.ndvi?.relativeStatus).toLocaleLowerCase('tr-TR'),
    }))
    .filter((item: any) => {
      if (!item.area) return false;

      // Yeni GeoBlaze akışında yalnızca anlamlı eşik aşılmış gerçek bölge farkı.
      if (item.status) return item.status === 'weaker';

      // Eski kayıtlarda geriye dönük uyumluluk.
      return (
        (item.delta != null && item.delta <= -0.04) ||
        (item.delta == null && item.relativeHealth != null && item.relativeHealth < 0.32)
      );
    })
    .sort((a: any, b: any) => {
      if (a.delta != null && b.delta != null) return a.delta - b.delta;
      return Number(a.relativeHealth ?? 0.5) - Number(b.relativeHealth ?? 0.5);
    })
    .slice(0, 3)
    .map(({ status: _status, ...item }: any) => item);
}



function resolvedSpatialImportantArea(result: any) {
  const layer =
    result?.interpretedLayer ??
    result?.activeLayer;

  const analysisArea =
    result?.analysis?.importantArea ?? null;

  if (analysisArea?.area) {
    return analysisArea;
  }

  const spatial =
    layer === 'vegetation'
      ? result?.context?.ndvi?.spatial
      : layer === 'radar-vv' ||
          layer === 'radar-vh' ||
          layer === 'radar-water'
        ? result?.context?.radar?.spatial
        : null;

  if (!spatial) return null;

  return (
    spatial?.importantAreaByLayer?.[layer] ??
    spatial?.importantArea ??
    null
  );
}

function findSpatialFinding(result: any, area: unknown) {
  const layer =
    result?.interpretedLayer ??
    result?.activeLayer;

  const spatial =
    layer === 'vegetation'
      ? result?.context?.ndvi?.spatial
      : layer === 'radar-vv' ||
          layer === 'radar-vh' ||
          layer === 'radar-water'
        ? result?.context?.radar?.spatial
        : null;

  if (!spatial) return null;

  const direct = spatial?.importantAreaByLayer?.[layer];

  if (direct && (!area || sameArea(direct?.area, area))) {
    return direct;
  }

  if (Array.isArray(spatial?.findings)) {
    return (
      spatial.findings.find((item: any) =>
        sameArea(item?.area, area),
      ) ?? null
    );
  }

  return null;
}


type PusulaEvidenceLayer = {
  layer: string;
  label: string;
  finding: string;
  status: 'normal' | 'dikkat' | 'kontrol';
  icon: string;
  navigable: boolean;
};

const PUSULA_LAYER_META: Record<
  string,
  { label: string; icon: string; target: string | null }
> = {
  vegetation: {
    label: 'NDVI · Vejetasyon',
    icon: '◉',
    target: 'vegetation',
  },
  'radar-vv': {
    label: 'Nemli Alanlar · Radar',
    icon: '≈',
    target: 'radar-vv',
  },
  'radar-vh': {
    label: 'Yüzey & Bitki Farkı',
    icon: '≋',
    target: 'radar-vh',
  },
  'radar-water': {
    label: 'Su Birikimi Riski',
    icon: '◌',
    target: 'radar-water',
  },
  soil: {
    label: 'Toprak',
    icon: '⌁',
    target: 'soil',
  },
  climate: {
    label: 'İklim',
    icon: '☁',
    target: 'climate',
  },
  'surface-temperature': {
    label: 'Yüzey Sıcaklığı',
    icon: '°',
    target: 'surface-temperature',
  },
  evapotranspiration: {
    label: 'Su İhtiyacı · ET₀',
    icon: '↟',
    target: 'evapotranspiration',
  },
  'water-demand': {
    label: 'Su İhtiyacı · ET₀',
    icon: '↟',
    target: 'evapotranspiration',
  },
  'rainfall-history': {
    label: 'Yağış Geçmişi',
    icon: '⋮',
    target: 'rainfall-history',
  },
  'rain-history': {
    label: 'Yağış Geçmişi',
    icon: '⋮',
    target: 'rainfall-history',
  },
  phenology: {
    label: 'Ürün Dönemi',
    icon: '◒',
    target: null,
  },
};

function normalizeEvidenceStatus(
  value: unknown,
): 'normal' | 'dikkat' | 'kontrol' {
  const status = cleanText(value).toLocaleLowerCase('tr-TR');

  if (status === 'dikkat') return 'dikkat';
  if (status === 'kontrol') return 'kontrol';
  return 'normal';
}

function buildEvidenceLayers(
  result: any,
  synthesis: any,
  currentLayerLabel: string,
): PusulaEvidenceLayer[] {
  const currentLayer = cleanText(
    result?.interpretedLayer ?? result?.activeLayer,
  );

  const sourceEvidence = Array.isArray(synthesis?.evidence)
    ? synthesis.evidence
    : [];

  const rows: PusulaEvidenceLayer[] = sourceEvidence
    .map((item: any) => {
      const layer = cleanText(item?.layer);
      const meta = PUSULA_LAYER_META[layer];

      if (!layer || !meta) return null;

      return {
        layer,
        label: cleanText(item?.layerLabel) || meta.label,
        finding:
          completeSentence(item?.finding) ||
          'Bu katman Pusula değerlendirmesine katkı verdi.',
        status: normalizeEvidenceStatus(item?.status),
        icon: meta.icon,
        navigable: Boolean(meta.target),
      };
    })
    .filter(Boolean) as PusulaEvidenceLayer[];

  // Sentez henüz hazır değilse bile açık katman kaybolmasın.
  if (currentLayer && !rows.some((row) => row.layer === currentLayer)) {
    const meta = PUSULA_LAYER_META[currentLayer];
    const analysis = result?.analysis ?? null;

    if (meta) {
      rows.unshift({
        layer: currentLayer,
        label: currentLayerLabel || meta.label,
        finding:
          completeSentence(analysis?.summary) ||
          completeSentence(analysis?.headline) ||
          'Açık harita katmanı bu yoruma doğrudan katkı verdi.',
        status: normalizeEvidenceStatus(analysis?.status),
        icon: meta.icon,
        navigable: Boolean(meta.target),
      });
    }
  }

  const unique = new Map<string, PusulaEvidenceLayer>();
  for (const row of rows) {
    const target = PUSULA_LAYER_META[row.layer]?.target ?? row.layer;
    if (!unique.has(target ?? row.layer)) {
      unique.set(target ?? row.layer, row);
    }
  }

  return Array.from(unique.values()).slice(0, 4);
}

function evidenceTarget(layer: string) {
  return PUSULA_LAYER_META[layer]?.target ?? null;
}

function resolvePusulaSignal(
  result: any,
  importantArea: any,
): PusulaSignal | null {
  const layer =
    result?.interpretedLayer ??
    result?.activeLayer;
  const area = titleArea(importantArea?.area);
  const finding = findSpatialFinding(
    result,
    importantArea?.area,
  );

  if (layer === 'vegetation') {
    const weakAreas = relativeWeakVegetationAreas(result);

    if (weakAreas.length) {
      const areaList = formatAreaList(weakAreas.map((item) => item.area));
      const strongestDelta = weakAreas
        .map((item) => item.delta)
        .filter((value): value is number => value != null)
        .sort((a, b) => a - b)[0] ?? null;

      return {
        tone:
          strongestDelta != null && strongestDelta <= -0.10
            ? 'negative'
            : 'attention',
        label: 'Göreli fark',
        text:
          strongestDelta != null
            ? `${areaList || area || 'Seçili bölge'} NDVI ortalaması parsel ortalamasından yaklaşık ${Math.abs(strongestDelta).toFixed(2)} daha düşük.`
            : `${areaList || area || 'Seçili bölge'} parselin diğer bölümlerine göre daha düşük NDVI gösteriyor.`,
      };
    }

    // Mutlak NDVI düşük/yüksek olması tek başına sağlık alarmı değildir.
    return null;
  }

  if (layer === 'radar-water') {
    const water = numberOrNull(
      finding?.radarWater?.blueRatio,
    );

    if (water != null && water >= 0.68) {
      return {
        tone: 'negative',
        label: 'Dikkat',
        text: area
          ? `${area} bölümünde su birikimi sinyali çevresine göre daha yüksek görünüyor.`
          : 'Su birikimi sinyali çevresine göre daha yüksek görünüyor.',
      };
    }
  }

  if (layer === 'radar-vv') {
    const backscatter = numberOrNull(
      finding?.radarVv?.relativeBackscatter,
    );

    if (backscatter != null) {
      const direction =
        backscatter > 0.5 ? 'daha yüksek' : 'daha düşük';

      return {
        tone: 'attention',
        label: 'Kontrol',
        text: area
          ? `${area} bölümünde radar nem sinyali çevresine göre ${direction}.`
          : `Radar nem sinyali çevresine göre ${direction}.`,
      };
    }
  }

  if (layer === 'radar-vh') {
    const texture = numberOrNull(
      finding?.radarVh?.textureScore,
    );

    if (texture != null && texture >= 0.7) {
      return {
        tone: 'attention',
        label: 'Kontrol',
        text: area
          ? `${area} bölümünde yüzey ve bitki yapısı çevresine göre belirgin farklılık gösteriyor.`
          : 'Yüzey ve bitki yapısında çevresine göre belirgin farklılık var.',
      };
    }
  }

  const status = cleanText(
    result?.analysis?.status,
  ).toLocaleLowerCase('tr-TR');

  if (status === 'dikkat') {
    return { tone: 'negative', label: 'Dikkat' };
  }

  if (status === 'kontrol') {
    return { tone: 'attention', label: 'Kontrol' };
  }

  if (status === 'normal') {
    return { tone: 'neutral', label: 'Normal' };
  }

  return null;
}

export default function HomeMapPusulaStrip({
  fieldName,
  layerLabel,
  activeLayer = null,
  soilProperty = null,
  climateLayer = null,
  loading,
  dataStatusMessage,
  headline,
  summary,
  result,
  synthesis,
  ndviStats = null,
  error,
  decision,
  onOpenDecision,
  onOpenLayer,
  onRefresh,
  showOnMapAvailable = false,
  onShowOnMap,
}: Props) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Haritada gerçek katman sonucu veya kullanılabilir NDVI varsa genel karar
  // bu alanın önüne geçmez. Böylece "Haritada göster" ilk açılışta da kaybolmaz.
  const visibleDecision = result || showOnMapAvailable ? null : decision;
  const refreshBusy = loading || refreshing;

  const handleRefresh = async () => {
    if (!onRefresh || refreshBusy) return;

    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const analysis = result?.analysis ?? null;
  const importantArea =
    resolvedSpatialImportantArea(result);

  const ndviMetricsVisible = Boolean(
    ndviStats &&
      (
        result?.interpretedLayer === 'vegetation' ||
        result?.activeLayer === 'vegetation' ||
        showOnMapAvailable
      ),
  );

  const signal = useMemo<PusulaSignal | null>(
    () => visibleDecision
      ? { tone: visibleDecision.severity === 'danger' ? 'negative' as const : 'attention' as const, label: visibleDecision.severity === 'danger' ? 'Dikkat' : 'Kontrol' }
      : resolvePusulaSignal(result, importantArea),
    [visibleDecision, result, importantArea],
  );

  const reasons = useMemo(
    () =>
      visibleDecision
        ? (visibleDecision.evidence ?? []).map(cleanText).filter(Boolean).slice(0, 3)
        : Array.isArray(analysis?.reasons)
        ? analysis.reasons
            .map((item: unknown) => cleanText(item))
            .filter(Boolean)
            .slice(0, 3)
        : [],
    [visibleDecision, analysis?.reasons],
  );


  const evidenceLayers = useMemo(
    () => visibleDecision ? [] : buildEvidenceLayers(result, synthesis, layerLabel),
    [visibleDecision, result, synthesis, layerLabel],
  );

  const ndviDisplayPercentages = useMemo(
    () => (ndviStats ? getNdviDisplayPercentages(ndviStats) : null),
    [ndviStats],
  );

  const relativeWeakAreas = useMemo(
    () => relativeWeakVegetationAreas(result),
    [result],
  );

  const compactText = useMemo(() => {
    if (visibleDecision) return `${visibleDecision.title}: ${completeSentence(visibleDecision.detail)}`;
    if (loading && !result) return `${layerLabel} verisi yorumlanıyor…`;
    if (error && !result) return `Pusula yorumu alınamadı: ${error}`;

    const vegetationContext =
      result?.interpretedLayer === 'vegetation' ||
      result?.activeLayer === 'vegetation' ||
      (showOnMapAvailable && Boolean(ndviStats));

    if (vegetationContext && ndviStats) {
      const distribution =
        ndviDisplayPercentages ?? getNdviDisplayPercentages(ndviStats);
      const base =
        `Parsel ortalaması ${ndviStats.mean.toFixed(2)} · mutlak NDVI dağılımı: ` +
        `Yüksek %${distribution.healthy} · Orta %${distribution.moderate} · Düşük %${distribution.stressed}.`;

      if (relativeWeakAreas.length) {
        const areaList = formatAreaList(relativeWeakAreas.map((item) => item.area));
        const delta = relativeWeakAreas
          .map((item) => item.delta)
          .filter((value): value is number => value != null)
          .sort((a, b) => a - b)[0] ?? null;

        return `${base} ${areaList} ${
          delta != null
            ? `parsel ortalamasından yaklaşık ${Math.abs(delta).toFixed(2)} NDVI daha düşük.`
            : 'parsel ortalamasına göre daha düşük NDVI gösteriyor.'
        }`;
      }

      return `${base} Parsel içinde ortalamadan anlamlı derecede düşük bir bölge ayrışmıyor.`;
    }

    if (showOnMapAvailable && !result) {
      return 'NDVI verisi hazır. Parsel içi göreli fark için Pusula değerlendirmesi hazırlanıyor.';
    }

    if (signal?.text) {
      return signal.text;
    }

    if (importantArea) {
      const area = titleArea(importantArea?.area);
      const areaSummary =
        completeSentence(importantArea?.summary) ||
        completeSentence(analysis?.headline);

      if (area && areaSummary) {
        return `${area}: ${areaSummary}`;
      }
    }

    return (
      completeSentence(analysis?.headline) ||
      completeSentence(headline) ||
      completeSentence(analysis?.summary) ||
      completeSentence(summary) ||
      `${fieldName} için harita verileri değerlendiriliyor.`
    );
  }, [
    visibleDecision,
    loading,
    error,
    result,
    showOnMapAvailable,
    ndviStats,
    ndviDisplayPercentages,
    relativeWeakAreas,
    signal?.text,
    importantArea,
    analysis?.headline,
    analysis?.summary,
    headline,
    summary,
    fieldName,
    layerLabel,
  ]);

  const action = visibleDecision ? '' : trimCompact(analysis?.action, 150);
  const knowledgeSources =
    !visibleDecision && Array.isArray(analysis?.knowledgeSources)
      ? analysis.knowledgeSources.slice(0, 3)
      : [];
  const canExplain =
    reasons.length > 0 ||
    Boolean(action) ||
    evidenceLayers.length > 0 ||
    knowledgeSources.length > 0;

  /*
   * NDVI ve radar katmanlarında AI'nin area metni gelmese bile kendi
   * gerçek mekânsal raster/spatial verimiz var. Bu nedenle butonu
   * yalnızca analysis.importantArea'ya bağlamıyoruz.
   *
   * Toprak/iklim gibi model çözünürlüğü tarla ölçeğinde yerel bir alan
   * üretmiyorsa sahte hotspot göstermemek için buton kapalı kalır.
   */
  const interpretedLayer =
    result?.interpretedLayer ??
    result?.activeLayer;

  const hasSpatialRaster =
    interpretedLayer === 'vegetation'
      ? relativeWeakAreas.length > 0
      : interpretedLayer === 'radar-vv' ||
          interpretedLayer === 'radar-vh' ||
          interpretedLayer === 'radar-water'
        ? Boolean(
            result?.context?.radar?.spatial ||
              importantArea,
          )
        : Boolean(
            importantArea?.geometry ||
              importantArea?.bounds ||
              importantArea?.area,
          );

  const isVegetationContext =
    interpretedLayer === 'vegetation' ||
    (showOnMapAvailable && Boolean(ndviStats));

  const canShowOnMap = isVegetationContext
    ? relativeWeakAreas.length > 0
    : Boolean(result) && hasSpatialRaster;

  return (
    <>
      <style>{CSS}</style>

      <section
        className={[
          'tp-home-map-pusula-strip',
          refreshBusy && !visibleDecision && !result ? 'is-loading' : '',
          error && !visibleDecision && !result ? 'has-error' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Pusula harita yorumu"
      >
        <span className="tp-home-map-pusula-logo" aria-hidden="true">
          <img src={PUSULA_INLINE_SRC} alt="" draggable={false} />
        </span>

        <div className="tp-home-map-pusula-copy">
          <div className="tp-home-map-pusula-kicker">
            PUSULA
            <span>{visibleDecision ? `${fieldName} · ${visibleDecision.label}` : layerLabel}</span>
            {signal ? (
              <em
                className={`tp-home-map-pusula-signal ${signal.tone}`}
              >
                {signal.label}
              </em>
            ) : null}
            <KnowledgeQuickView
              activeLayer={activeLayer}
              soilProperty={soilProperty}
              climateLayer={climateLayer}
            />
          </div>

          <p className="tp-home-map-pusula-text" role="status">{result ? compactText : dataStatusMessage || compactText}</p>
          {error && result ? (
            <small className="tp-home-map-pusula-refresh-error" role="status">
              Yeni yorum alınamadı; önceki yorum gösteriliyor. Tekrar deneyebilirsin.
            </small>
          ) : null}
        </div>

        <div className="tp-home-map-pusula-actions">
          {onRefresh ? (
            <button
              type="button"
              className="tp-home-map-pusula-refresh"
              disabled={refreshBusy}
              aria-label={refreshBusy ? 'Harita ve Pusula yenileniyor' : 'Harita ve Pusula verisini yenile'}
              title="Harita ve Pusula verisini yenile"
              onClick={() => void handleRefresh()}
            >
              <span className={refreshBusy ? 'is-spinning' : ''} aria-hidden="true">↻</span>
              <span className="tp-home-map-pusula-refresh-label">
                {refreshBusy ? 'Yenileniyor' : 'Yenile'}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className="tp-home-map-pusula-why"
            disabled={!canExplain}
            onClick={() => setWhyOpen(true)}
          >
            Neden?
          </button>

          <button
            type="button"
            className="tp-home-map-pusula-show"
            disabled={!canShowOnMap && !(visibleDecision && onOpenDecision)}
            onClick={() => canShowOnMap ? onShowOnMap() : visibleDecision && onOpenDecision?.(visibleDecision.target)}
          >
            {canShowOnMap
              ? isVegetationContext
                ? 'Göreli farkı göster'
                : 'Haritada göster'
              : visibleDecision
                ? 'Detayı aç'
                : 'Haritada göster'}
          </button>
        </div>
      </section>

      {whyOpen && canExplain ? (
        <>
          <button
            type="button"
            className="tp-home-map-why-backdrop"
            aria-label="Pusula açıklamasını kapat"
            onClick={() => setWhyOpen(false)}
          />

          <section
            className="tp-home-map-why-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Pusula neden açıklaması"
          >
            <div className="tp-home-map-why-head">
              <div>
                <small>PUSULA</small>
                <strong>Neden bunu söylüyorum?</strong>
              </div>

              <button
                type="button"
                className="tp-home-map-why-close"
                onClick={() => setWhyOpen(false)}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>

            <div className="tp-home-map-why-body">
              {reasons.length > 0 ? (
                <ul>
                  {reasons.map((reason: string, index: number) => (
                    <li key={`${index}:${reason}`}>{reason}</li>
                  ))}
                </ul>
              ) : null}

              {evidenceLayers.length > 0 ? (
                <div className="tp-home-map-why-layers">
                  <div className="tp-home-map-why-layers-title">
                    <strong>Bu karara katkı veren katmanlar</strong>
                    <span>Dokun → haritada aç</span>
                  </div>

                  <div className="tp-home-map-why-layer-list">
                    {evidenceLayers.map((item) => {
                      const target = evidenceTarget(item.layer);

                      return (
                        <button
                          type="button"
                          key={`${item.layer}:${item.label}`}
                          className="tp-home-map-why-layer"
                          disabled={!target || !onOpenLayer}
                          onClick={() => {
                            if (!target || !onOpenLayer) return;
                            setWhyOpen(false);
                            onOpenLayer(target);
                          }}
                        >
                          <span
                            className="tp-home-map-why-layer-icon"
                            aria-hidden="true"
                          >
                            {item.icon}
                          </span>

                          <span className="tp-home-map-why-layer-copy">
                            <strong>{item.label}</strong>
                            <span>{item.finding}</span>
                          </span>

                          <span
                            className={`tp-home-map-why-layer-status ${item.status}`}
                          >
                            {item.status}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <KnowledgeEvidenceSources sources={knowledgeSources} />

              {action ? (
                <p className="tp-home-map-why-action">{action}</p>
              ) : null}
              {visibleDecision && onOpenDecision ? (
                <button
                  type="button"
                  className="tp-home-map-why-action-link"
                  onClick={() => { setWhyOpen(false); onOpenDecision(visibleDecision.target); }}
                >
                  İlgili veriyi aç →
                </button>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
