// Continuous-line high-top sneaker SVG paths anchored to the horizontal crossbar of "A"
// inside the 1597 x 1069 PHILOA2BALLE rainy-glass artwork.
// Laces tie around (510, 536) and drop into the open rainy-glass area below the "A" baseline (y = 745..975)
// so neither "A" nor "BALLES" is obscured.

export const CROSSBAR_KNOT_PATH =
  'M 503 530 C 501 538, 503 545, 510 545 C 517 545, 519 538, 517 530 C 513 528, 507 528, 503 530 Z';

export const LACE_BOW_PATH =
  'M 505 531 C 484 516, 476 530, 501 535 M 515 531 C 536 516, 544 530, 519 535';

// Crisp double-strand laces descending cleanly from the crossbar (510, 536) down to the hanging shoes
export const LEFT_LACE_PATH =
  'M 507 541 C 498 612, 488 684, 474 756 M 510 542 C 501 614, 492 686, 479 758';

export const RIGHT_LACE_PATH =
  'M 513 541 C 527 615, 541 688, 554 762';

// Left high-top sneaker (tilted gracefully down-left, hanging at pivot 476, 756)
export const LEFT_SHOE_OUTLINE_PATH =
  'M 476 756 C 464 736, 453 718, 442 706 C 428 730, 412 762, 386 788 C 368 804, 362 820, 378 840 C 414 888, 464 938, 512 966 C 530 976, 540 962, 530 942 C 512 908, 494 866, 484 820 C 480 798, 478 776, 476 756';

export const LEFT_SHOE_DETAIL_PATH =
  'M 426 732 C 440 740, 458 750, 473 758 M 374 822 C 414 872, 464 924, 522 956 M 476 770 C 468 775, 481 784, 482 793 C 473 799, 486 808, 487 817 C 478 824, 492 832, 494 842 C 485 849, 502 860, 504 872';

// Right high-top sneaker (angled gently rightward below A baseline, pivot at 554, 762)
export const RIGHT_SHOE_OUTLINE_PATH =
  'M 554 762 C 540 756, 522 752, 508 750 C 503 788, 498 824, 496 854 C 495 867, 506 875, 534 880 C 584 890, 638 898, 680 898 C 700 898, 706 878, 688 866 C 664 850, 628 836, 600 814 C 582 798, 568 778, 554 762';

export const RIGHT_SHOE_DETAIL_PATH =
  'M 507 778 C 524 782, 540 785, 554 782 M 498 854 C 552 866, 620 878, 690 880 M 560 776 C 554 786, 570 791, 572 801 C 567 809, 584 814, 590 824 C 585 831, 604 836, 612 844 C 609 852, 628 854, 638 860';
