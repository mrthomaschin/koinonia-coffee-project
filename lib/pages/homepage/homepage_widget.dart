import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:koinonia_coffee_project/constants_library.dart';

class HomepageWidget extends StatelessWidget {
  const HomepageWidget({super.key, required this.availableHeight});

  final double availableHeight;

  @override
  Widget build(BuildContext context) {
    final heroHeight = availableHeight - ConstantsLibrary.clBottomBarHeight;

    return Column(
      children: [
        Container(
          width: double.infinity,
          height: heroHeight,
          decoration: BoxDecoration(
            image: DecorationImage(
              image: AssetImage('assets/images/DSC_0532.JPEG'),
              fit: BoxFit.cover,
            ),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final isMobile = ConstantsLibrary.isMobile(constraints);

              return Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SvgPicture.asset(
                        ConstantsLibrary.clLogoMark,
                        height: isMobile ? 60 : 80,
                        colorFilter: const ColorFilter.mode(
                          ConstantsLibrary.clPearlPrimaryColor,
                          BlendMode.srcIn,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        'Cultivating community, one cup at a time.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: ConstantsLibrary.clPrimaryFont,
                          fontSize: isMobile ? 28 : 50,
                          color: ConstantsLibrary.clPearlPrimaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        Container(
          padding: const EdgeInsets.all(40),
          decoration: BoxDecoration(
            color: ConstantsLibrary.clPearlPrimaryColor,
          ),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 800),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(
                    '"Koinonia" (κοινωνία) [koy-nohn-ee\'-ah]: (n.) communion, fellowship',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: ConstantsLibrary.clSecondaryFont,
                      fontSize: 24,
                      color: ConstantsLibrary.clMidnightPrimaryColor,
                      fontStyle: FontStyle.italic,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Koinonia Coffee is a community-driven coffee shop that sources directly from smallholder farmers in Central America and East Africa. We believe in building sustainable relationships with our farmers and creating a space where people can come together over great coffee.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: ConstantsLibrary.clSecondaryFont,
                      fontSize: 16,
                      color: ConstantsLibrary.clMidnightPrimaryColor,
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
