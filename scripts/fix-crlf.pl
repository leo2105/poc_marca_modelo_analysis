#!/usr/bin/env perl
use strict;
use warnings;
for my $path (glob("scripts/*.sh")) {
  open my $fh, "<:raw", $path or die $path;
  my $data = do { local $/; <$fh> };
  close $fh;
  my $fixed = $data;
  $fixed =~ s/\r\n/\n/g;
  $fixed =~ s/\r/\n/g;
  next if $fixed eq $data;
  open my $out, ">:raw", $path or die $path;
  print {$out} $fixed;
  close $out;
  print "fixed $path\n";
}
