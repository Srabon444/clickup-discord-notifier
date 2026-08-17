alter table clickup_users add column if not exists discord_display_name text;

-- Backfill from real Discord server nicknames (captured from the live
-- channel) — sort key only, doesn't affect the actual @mention rendering.
update clickup_users set discord_display_name = 'Abdul Al Joboyer Chy' where clickup_user_id = 107418221 and discord_display_name is null;
update clickup_users set discord_display_name = 'ahad30' where clickup_user_id = 107418223 and discord_display_name is null;
update clickup_users set discord_display_name = 'Arabin' where clickup_user_id = 113454616 and discord_display_name is null;
update clickup_users set discord_display_name = 'Ashraful' where clickup_user_id = 107464442 and discord_display_name is null;
update clickup_users set discord_display_name = 'buariful' where clickup_user_id = 107628336 and discord_display_name is null;
update clickup_users set discord_display_name = 'Rafi' where clickup_user_id = 107693382 and discord_display_name is null;
update clickup_users set discord_display_name = 'Shahin Alam' where clickup_user_id = 107583352 and discord_display_name is null;
update clickup_users set discord_display_name = 'Sharif' where clickup_user_id = 107418222 and discord_display_name is null;
update clickup_users set discord_display_name = 'Tanvir Ahmed' where clickup_user_id = 113454615 and discord_display_name is null;
update clickup_users set discord_display_name = 'Tur Za' where clickup_user_id = 113624265 and discord_display_name is null;
